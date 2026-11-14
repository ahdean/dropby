/**
 * Private messages: one conversation per pair of people, optionally quoting a
 * block. Only the two of them can read it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb } from "./harness";

let db: TestDb;

beforeAll(async () => {
  db = await TestDb.create();
});

afterAll(async () => {
  await db.close();
});

const send = (from: string, to: string, body: string, blockId: string | null = null, occurrence = 0) =>
  db.as<{ id: string; quote: Record<string, unknown> | null; block_id: string | null }>(
    from,
    `insert into public.direct_messages (recipient_id, body, block_id, occurrence) values ($1, $2, $3, $4) returning id, quote, block_id`,
    [to, body, blockId, occurrence],
  );

const sendError = (from: string, to: string, body: string, blockId: string | null = null) =>
  db.asError(from, `insert into public.direct_messages (recipient_id, body, block_id) values ($1, $2, $3)`, [to, body, blockId]);

const bodies = async (viewer: string) =>
  (await db.as<{ body: string }>(viewer, `select body from public.direct_messages order by created_at, body`)).map((r) => r.body);

describe("who can message whom", () => {
  it("connections can write to each other, both ways", async () => {
    const [a, b] = await db.createUsers("Ana", "Ben");
    await db.connect(a, b);
    await send(a, b, "hey");
    await send(b, a, "hi back");
    expect(await bodies(a)).toEqual(["hey", "hi back"]);
    expect(await bodies(b)).toEqual(["hey", "hi back"]);
  });

  it("strangers and mutuals cannot", async () => {
    const [owner, a, b, stranger] = await db.createUsers("Owner", "A", "B", "Stranger");
    await db.connect(owner, a);
    await db.connect(owner, b);
    await db.createGroup(owner, "Crew", [a, b]); // a and b are mutuals, not connections
    expect(await sendError(a, stranger, "hello?")).toMatch(/row-level security/);
    expect(await sendError(a, b, "hello?")).toMatch(/row-level security/);
  });

  it("nobody can write in someone else's name, or to themself", async () => {
    const [a, b, c] = await db.createUsers("A", "B", "C");
    await db.connect(a, b);
    await db.connect(b, c);
    const forged = await db.asError(
      a,
      `insert into public.direct_messages (sender_id, recipient_id, body) values ($1, $2, 'fake')`,
      [b, c],
    );
    expect(forged).toMatch(/row-level security/);
    expect(await sendError(a, a, "note to self")).toMatch(/direct_messages_not_self|row-level security/);
  });

  it("a blocked pair cannot write, and the old conversation disappears for both", async () => {
    const [a, b] = await db.createUsers("A", "B");
    await db.connect(a, b);
    await send(a, b, "before");
    await db.as(a, `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]);
    expect(await sendError(b, a, "why?")).toMatch(/row-level security/);
    expect(await bodies(a)).toEqual([]);
    expect(await bodies(b)).toEqual([]);
  });

  it("signed-out visitors cannot read or write", async () => {
    const [a] = await db.createUsers("A");
    expect(await db.asError(null, `select * from public.direct_messages`)).toMatch(/permission denied/);
    expect(await db.asError(null, `insert into public.direct_messages (sender_id, recipient_id, body) values ($1, $1, 'x')`, [a])).toMatch(
      /permission denied/,
    );
  });
});

describe("privacy", () => {
  it("only the two people in a conversation can read it", async () => {
    const [a, b, c] = await db.createUsers("A", "B", "C");
    await db.connect(a, b);
    await db.connect(a, c);
    await db.connect(b, c);
    await send(a, b, "just between us");
    expect(await bodies(c)).toEqual([]);
    expect(await bodies(b)).toEqual(["just between us"]);
  });

  it("only the sender can delete a message; only the recipient can mark it read", async () => {
    const [a, b] = await db.createUsers("A", "B");
    await db.connect(a, b);
    const [message] = await send(a, b, "oops");

    await db.as(a, `update public.direct_messages set read_at = now() where id = $1`, [message.id]);
    expect(await db.admin(`select 1 from public.direct_messages where id = $1 and read_at is not null`, [message.id])).toHaveLength(0);
    await db.as(b, `update public.direct_messages set read_at = now() where id = $1`, [message.id]);
    expect(await db.admin(`select 1 from public.direct_messages where id = $1 and read_at is not null`, [message.id])).toHaveLength(1);

    await db.as(b, `delete from public.direct_messages where id = $1`, [message.id]);
    expect(await db.admin(`select 1 from public.direct_messages where id = $1`, [message.id])).toHaveLength(1);
    await db.as(a, `delete from public.direct_messages where id = $1`, [message.id]);
    expect(await db.admin(`select 1 from public.direct_messages where id = $1`, [message.id])).toHaveLength(0);
  });

  it("the words cannot be edited afterwards, and a message cannot be backdated or pre-read", async () => {
    const [a, b] = await db.createUsers("A", "B");
    await db.connect(a, b);
    const [message] = await send(a, b, "original");
    expect(await db.asError(b, `update public.direct_messages set body = 'changed' where id = $1`, [message.id])).toMatch(/permission denied/);

    await db.as(
      a,
      `insert into public.direct_messages (recipient_id, body, created_at, read_at) values ($1, 'sneaky', '2000-01-01', '2000-01-01')`,
      [b],
    );
    const [row] = await db.admin<{ old: boolean; read: boolean }>(
      `select created_at < now() - interval '1 day' as old, read_at is not null as read from public.direct_messages where body = 'sneaky'`,
    );
    expect(row).toEqual({ old: false, read: false });
  });
});

describe("quoting a block", () => {
  it("attaches a snapshot written by the database, for a block both people can see", async () => {
    const [host, guest] = await db.createUsers("Hana", "Gus");
    await db.connect(host, guest);
    const event = await db.createBlock(host, { type: "join", title: "Pizza night", emoji: "🍕" });

    const [message] = await send(guest, host, "can I bring my dog?", event);
    expect(message.block_id).toBe(event);
    expect(message.quote).toMatchObject({ owner_id: host, owner_name: "Hana", block_type: "join", title: "Pizza night", emoji: "🍕" });

    // The host can quote it back.
    const [reply] = await send(host, guest, "of course", event);
    expect(reply.quote).toMatchObject({ title: "Pizza night" });
  });

  it("ignores a quote supplied by the sender", async () => {
    const [a, b] = await db.createUsers("A", "B");
    await db.connect(a, b);
    await db.as(a, `insert into public.direct_messages (recipient_id, body, quote) values ($1, 'look', '{"title":"Free money"}')`, [b]);
    const [row] = await db.admin<{ quote: unknown }>(`select quote from public.direct_messages where body = 'look'`);
    expect(row.quote).toBeNull();
  });

  it("refuses to quote a block that either person cannot see", async () => {
    const [host, guest, friend] = await db.createUsers("Host", "Guest", "Friend");
    await db.connect(host, guest);
    await db.connect(guest, friend);
    const secret = await db.createBlock(host, { audience: "custom" }); // shared with nobody
    const shared = await db.createBlock(host, { audience: "all_connections" }); // guest sees it, friend does not

    expect(await sendError(guest, host, "what's this?", secret)).toMatch(/row-level security/);
    expect(await sendError(guest, friend, "look what Host is doing", shared)).toMatch(/row-level security/);
  });

  it("quotes the right week of a weekly repeat, at the same local time", async () => {
    const [host, guest] = await db.createUsers("Host", "Guest");
    await db.connect(host, guest);
    // Tuesdays 6–8 PM New York, starting 20 Oct 2026 (daylight time); the harness creates blocks in that zone.
    const weekly = await db.createBlock(host, {
      type: "free",
      repeat_weekly: true,
      start_at: "2026-10-20T22:00:00Z",
      end_at: "2026-10-21T00:00:00Z",
    });
    const [message] = await send(guest, host, "that week works", weekly, 2);
    // Week 2 is 3 Nov, after clocks go back: still 6 PM local, which is 23:00 UTC.
    expect(new Date(message.quote!.start_at as string).toISOString()).toBe("2026-11-03T23:00:00.000Z");
  });

  it("keeps the quote readable after the block is deleted", async () => {
    const [host, guest] = await db.createUsers("Host", "Guest");
    await db.connect(host, guest);
    const event = await db.createBlock(host, { type: "join", title: "Board games" });
    await send(guest, host, "running late", event);
    await db.as(host, `delete from public.blocks where id = $1`, [event]);
    const [row] = await db.as<{ block_id: string | null; quote: Record<string, unknown> }>(
      host,
      `select block_id, quote from public.direct_messages where body = 'running late'`,
    );
    expect(row.block_id).toBeNull();
    expect(row.quote).toMatchObject({ title: "Board games" });
  });
});

describe("the bell", () => {
  const dms = async (user: string) => (await db.notifications(user)).filter((n) => n.type === "dm");

  it("shows one unread notification per person who wrote, with the latest words", async () => {
    const [a, b, c] = await db.createUsers("Ana", "Ben", "Cy");
    await db.connect(a, b);
    await db.connect(c, b);
    await send(a, b, "first");
    await send(a, b, "second");
    await send(c, b, "from someone else");

    const bell = await dms(b);
    expect(bell).toHaveLength(2);
    expect(bell.find((n) => n.actor_id === a)).toMatchObject({ data: { actor_name: "Ana", preview: "second" } });
    expect(await dms(a)).toHaveLength(0); // never notified about your own messages
  });

  it("is cleared when the messages are read", async () => {
    const [a, b] = await db.createUsers("A", "B");
    await db.connect(a, b);
    await send(a, b, "ping");
    await db.as(b, `update public.direct_messages set read_at = now() where recipient_id = $1 and sender_id = $2`, [b, a]);
    expect((await dms(b)).filter((n) => n.read_at === null)).toHaveLength(0);
  });
});
