/**
 * Hosted events: RSVPs, chat, invite links and the notifications they produce.
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

describe("RSVPs", () => {
  it("guests answer for themselves; the host is told and can see who is in", async () => {
    const [host, guest] = await db.createUsers("Host", "Gia");
    await db.connect(host, guest);
    const event = await db.createBlock(host, { type: "join", title: "Pizza night" });

    await db.as(guest, `insert into public.rsvps (block_id, status) values ($1, 'in')`, [event]);
    const rows = await db.as(host, `select user_id, status, occurrence from public.rsvps where block_id = $1`, [event]);
    expect(rows).toEqual([{ user_id: guest, status: "in", occurrence: 0 }]);

    const bell = (await db.notifications(host)).filter((n) => n.type === "rsvp");
    expect(bell).toMatchObject([{ actor_id: guest, block_id: event, data: { actor_name: "Gia", status: "in", title: "Pizza night" } }]);
  });

  it("changing an answer updates the same notification instead of adding another", async () => {
    const [host, guest] = await db.createUsers("Host", "Guest");
    await db.connect(host, guest);
    const event = await db.createBlock(host, { type: "join" });
    await db.as(guest, `insert into public.rsvps (block_id, status) values ($1, 'in')`, [event]);
    await db.as(guest, `update public.rsvps set status = 'out' where block_id = $1 and user_id = $2`, [event, guest]);

    const bell = (await db.notifications(host)).filter((n) => n.type === "rsvp");
    expect(bell).toHaveLength(1);
    expect(bell[0]).toMatchObject({ data: { status: "out" }, read_at: null });
  });

  it("are kept per occurrence for weekly events", async () => {
    const [host, guest] = await db.createUsers("Host", "Guest");
    await db.connect(host, guest);
    const event = await db.createBlock(host, { type: "join", repeat_weekly: true });
    await db.as(guest, `insert into public.rsvps (block_id, occurrence, status) values ($1, 0, 'in'), ($1, 2, 'out')`, [event]);
    const rows = await db.as(host, `select occurrence, status from public.rsvps where block_id = $1 order by occurrence`, [event]);
    expect(rows).toEqual([
      { occurrence: 0, status: "in" },
      { occurrence: 2, status: "out" },
    ]);
  });

  it("cannot be forged for someone else", async () => {
    const [host, guest, other] = await db.createUsers("Host", "Guest", "Other");
    await db.connect(host, guest);
    await db.connect(host, other);
    const event = await db.createBlock(host, { type: "join" });
    const error = await db.asError(guest, `insert into public.rsvps (block_id, user_id, status) values ($1, $2, 'in')`, [event, other]);
    expect(error).toMatch(/row-level security/);
  });

  it("are refused on free time, when the host switched RSVPs off, and from the host", async () => {
    const [host, guest] = await db.createUsers("Host", "Guest");
    await db.connect(host, guest);
    const free = await db.createBlock(host, { type: "free" });
    const noRsvp = await db.createBlock(host, { type: "join", rsvp_enabled: false });
    const event = await db.createBlock(host, { type: "join" });

    expect(await db.asError(guest, `insert into public.rsvps (block_id, status) values ($1, 'in')`, [free])).toMatch(/row-level security/);
    expect(await db.asError(guest, `insert into public.rsvps (block_id, status) values ($1, 'in')`, [noRsvp])).toMatch(/row-level security/);
    expect(await db.asError(host, `insert into public.rsvps (block_id, status) values ($1, 'in')`, [event])).toMatch(/row-level security/);
  });

  it("disappear when the guest loses access, so they never count toward 'locked in'", async () => {
    const [host, guest] = await db.createUsers("Host", "Guest");
    await db.connect(host, guest);
    const event = await db.createBlock(host, { type: "join", audience: "custom" });
    await db.as(host, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [event, guest]);
    await db.as(guest, `insert into public.rsvps (block_id, status) values ($1, 'in')`, [event]);

    await db.as(host, `delete from public.block_user_shares where block_id = $1 and user_id = $2`, [event, guest]);
    expect(await db.admin(`select 1 from public.rsvps where block_id = $1`, [event])).toHaveLength(0);
  });

  it("are cleared if the host turns the event back into free time", async () => {
    const [host, guest] = await db.createUsers("Host", "Guest");
    await db.connect(host, guest);
    const event = await db.createBlock(host, { type: "join" });
    await db.as(guest, `insert into public.rsvps (block_id, status) values ($1, 'in')`, [event]);
    await db.as(host, `update public.blocks set type = 'free' where id = $1`, [event]);
    expect(await db.admin(`select 1 from public.rsvps where block_id = $1`, [event])).toHaveLength(0);
  });
});

describe("a hosted event needs an emoji", () => {
  it("rejects a join block without one", async () => {
    const [host] = await db.createUsers("Host");
    const error = await db.asError(
      host,
      `insert into public.blocks (type, start_at, end_at) values ('join', now(), now() + interval '1 hour')`,
    );
    expect(error).toMatch(/blocks_join_needs_emoji/);
  });

  it("rejects blocks that end before they start or run longer than a day", async () => {
    const [host] = await db.createUsers("Host");
    expect(
      await db.asError(host, `insert into public.blocks (type, start_at, end_at) values ('free', now(), now() - interval '1 hour')`),
    ).toMatch(/blocks_time_order/);
    expect(
      await db.asError(host, `insert into public.blocks (type, start_at, end_at) values ('free', now(), now() + interval '25 hours')`),
    ).toMatch(/blocks_max_length/);
  });
});

describe("event chat", () => {
  it("is open to everyone the event is shared with, and only to them", async () => {
    const [host, a, b, outsider] = await db.createUsers("Host", "Ana", "Ben", "Outsider");
    for (const guest of [a, b, outsider]) await db.connect(host, guest);
    const event = await db.createBlock(host, { type: "join", audience: "custom" });
    await db.as(host, `insert into public.block_user_shares (block_id, user_id) values ($1, $2), ($1, $3)`, [event, a, b]);

    await db.as(a, `insert into public.messages (block_id, body) values ($1, 'I can bring snacks')`, [event]);
    await db.as(host, `insert into public.messages (block_id, body) values ($1, 'Perfect')`, [event]);

    expect(await db.as(b, `select body from public.messages where block_id = $1 order by created_at`, [event])).toHaveLength(2);
    expect(await db.as(outsider, `select body from public.messages where block_id = $1`, [event])).toHaveLength(0);
    expect(await db.asError(outsider, `insert into public.messages (block_id, body) values ($1, 'hello?')`, [event])).toMatch(/row-level security/);
  });

  it("is not available on free time", async () => {
    const [host, guest] = await db.createUsers("Host", "Guest");
    await db.connect(host, guest);
    const free = await db.createBlock(host, { type: "free" });
    expect(await db.asError(guest, `insert into public.messages (block_id, body) values ($1, 'hi')`, [free])).toMatch(/row-level security/);
  });

  it("cannot be written in someone else's name", async () => {
    const [host, guest] = await db.createUsers("Host", "Guest");
    await db.connect(host, guest);
    const event = await db.createBlock(host, { type: "join" });
    const error = await db.asError(guest, `insert into public.messages (block_id, user_id, body) values ($1, $2, 'fake')`, [event, host]);
    expect(error).toMatch(/row-level security/);
  });

  it("notifies the host and people taking part, once per event until they read it", async () => {
    const [host, inGuest, lurker] = await db.createUsers("Host", "Ina", "Lurker");
    await db.connect(host, inGuest);
    await db.connect(host, lurker);
    const event = await db.createBlock(host, { type: "join" });
    await db.as(inGuest, `insert into public.rsvps (block_id, status) values ($1, 'in')`, [event]);

    await db.as(host, `insert into public.messages (block_id, body) values ($1, 'first')`, [event]);
    await db.as(host, `insert into public.messages (block_id, body) values ($1, 'second')`, [event]);

    const chat = async (user: string) => (await db.notifications(user)).filter((n) => n.type === "chat");
    expect(await chat(inGuest)).toMatchObject([{ actor_id: host, data: { preview: "second" } }]);
    expect(await chat(lurker)).toHaveLength(0); // has not answered or written
    expect(await chat(host)).toHaveLength(0); // never notified about own messages

    await db.as(inGuest, `insert into public.messages (block_id, body) values ($1, 'reply')`, [event]);
    expect(await chat(host)).toMatchObject([{ actor_id: inGuest, data: { preview: "reply" } }]);
  });

  it("messages can be deleted by their author or the host, not by other guests", async () => {
    const [host, a, b] = await db.createUsers("Host", "A", "B");
    await db.connect(host, a);
    await db.connect(host, b);
    const event = await db.createBlock(host, { type: "join" });
    const [message] = await db.as<{ id: string }>(a, `insert into public.messages (block_id, body) values ($1, 'oops') returning id`, [event]);

    await db.as(b, `delete from public.messages where id = $1`, [message.id]);
    expect(await db.admin(`select 1 from public.messages where id = $1`, [message.id])).toHaveLength(1);
    await db.as(host, `delete from public.messages where id = $1`, [message.id]);
    expect(await db.admin(`select 1 from public.messages where id = $1`, [message.id])).toHaveLength(0);
  });
});

describe("sharing notifications (the bell)", () => {
  it("a hosted event notifies each person once", async () => {
    const [host, a, b] = await db.createUsers("Hana", "A", "B");
    await db.connect(host, a);
    await db.connect(host, b);
    const event = await db.createBlock(host, { type: "join", title: "Board games", audience: "all_connections" });

    for (const guest of [a, b]) {
      const bell = (await db.notifications(guest)).filter((n) => n.type === "event_shared");
      expect(bell).toMatchObject([{ actor_id: host, block_id: event, data: { actor_name: "Hana", title: "Board games", emoji: "🍕" } }]);
    }
    expect(await db.notifications(host)).toHaveLength(0);

    // re-saving the audience does not notify again
    await db.as(host, `update public.blocks set audience = 'custom' where id = $1`, [event]);
    await db.as(host, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [event, a]);
    expect((await db.notifications(a)).filter((n) => n.type === "event_shared")).toHaveLength(1);
  });

  it("free time is rolled up into one unread notification per friend", async () => {
    const [friend, me] = await db.createUsers("Fay", "Me");
    await db.connect(friend, me);
    await db.createBlock(friend, { type: "free" });
    await db.createBlock(friend, { type: "free", start_at: "2026-11-22T18:00:00Z", end_at: "2026-11-22T20:00:00Z" });
    const latest = await db.createBlock(friend, { type: "free", start_at: "2026-11-23T18:00:00Z", end_at: "2026-11-23T20:00:00Z" });

    const bell = (await db.notifications(me)).filter((n) => n.type === "free_shared");
    expect(bell).toHaveLength(1);
    expect(bell[0]).toMatchObject({ actor_id: friend, block_id: latest });
  });

  it("only the recipient can read or dismiss a notification; nobody can write one", async () => {
    const [host, guest, nosy] = await db.createUsers("Host", "Guest", "Nosy");
    await db.connect(host, guest);
    await db.createBlock(host, { type: "join" });

    expect(await db.as(nosy, `select 1 from public.notifications`)).toHaveLength(0);
    await db.as(nosy, `update public.notifications set read_at = now()`);
    expect(await db.admin(`select 1 from public.notifications where user_id = $1 and read_at is not null`, [guest])).toHaveLength(0);

    await db.as(guest, `update public.notifications set read_at = now() where user_id = $1`, [guest]);
    expect(await db.admin(`select 1 from public.notifications where user_id = $1 and read_at is null`, [guest])).toHaveLength(0);

    const error = await db.asError(nosy, `insert into public.notifications (user_id, type) values ($1, 'connected')`, [guest]);
    expect(error).toMatch(/permission denied/);
  });

  it("deleting the event removes its notifications", async () => {
    const [host, guest] = await db.createUsers("Host", "Guest");
    await db.connect(host, guest);
    const event = await db.createBlock(host, { type: "join" });
    await db.as(host, `delete from public.blocks where id = $1`, [event]);
    expect(await db.notifications(guest)).toHaveLength(0);
  });
});

describe("invite links", () => {
  const createInvite = async (inviter: string, block: string | null) => {
    const [row] = await db.as<{ token: string }>(inviter, `insert into public.invites (block_id) values ($1) returning token`, [block]);
    return row.token;
  };

  it("tokens are long, random and different every time", async () => {
    const [host] = await db.createUsers("Host");
    const event = await db.createBlock(host, { type: "join" });
    const a = await createInvite(host, event);
    const b = await createInvite(host, event);
    expect(a).toMatch(/^[a-zA-Z2-9]{12}$/);
    expect(a).not.toBe(b);
  });

  it("show a small public preview to signed-out visitors, without the location", async () => {
    const [host] = await db.createUsers("Hana");
    const event = await db.createBlock(host, { type: "join", title: "Rooftop drinks" });
    await db.admin(`update public.blocks set location = '12 Secret St', description = 'BYO' where id = $1`, [event]);
    const token = await createInvite(host, event);

    const [row] = await db.as<{ preview: Record<string, unknown> }>(null, `select public.get_invite_preview($1) as preview`, [token]);
    expect(row.preview).toMatchObject({
      kind: "block",
      inviter: { name: "Hana" },
      block: { type: "join", title: "Rooftop drinks", emoji: "🍕", description: "BYO", has_location: true },
    });
    expect(JSON.stringify(row.preview)).not.toContain("Secret St");
    expect(JSON.stringify(row.preview)).not.toContain(event); // no ids

    const [missing] = await db.as<{ preview: unknown }>(null, `select public.get_invite_preview('nope-nope-nope') as preview`);
    expect(missing.preview).toBeNull();
  });

  it("signing in from a link connects the new person to the sharer and shares the event", async () => {
    const [host, newcomer] = await db.createUsers("Hana", "Nico");
    const event = await db.createBlock(host, { type: "join", audience: "custom" });
    const token = await createInvite(host, event);
    expect(await db.canSee(newcomer, event)).toBe(false);

    const [row] = await db.as<{ result: Record<string, unknown> }>(newcomer, `select public.redeem_invite($1) as result`, [token]);
    expect(row.result).toMatchObject({ kind: "block", block_id: event, inviter_id: host, block_type: "join" });

    expect(await db.areConnected(host, newcomer)).toBe(true);
    expect(await db.canSee(newcomer, event)).toBe(true);
    expect((await db.notifications(host)).filter((n) => n.type === "invite_accepted")).toMatchObject([
      { actor_id: newcomer, data: { actor_name: "Nico" } },
    ]);
    // the newcomer is looking at the event already: nothing unread for them
    expect((await db.notifications(newcomer)).filter((n) => n.read_at === null)).toHaveLength(0);

    // opening the link again does nothing new
    await db.as(newcomer, `select public.redeem_invite($1)`, [token]);
    expect((await db.notifications(host)).filter((n) => n.type === "invite_accepted")).toHaveLength(1);
  });

  it("a connect-only link (no event) just connects the two", async () => {
    const [host, newcomer] = await db.createUsers("Host", "Newcomer");
    const token = await createInvite(host, null);
    const [row] = await db.as<{ result: Record<string, unknown> }>(newcomer, `select public.redeem_invite($1) as result`, [token]);
    expect(row.result).toMatchObject({ kind: "connect", block_id: null });
    expect(await db.areConnected(host, newcomer)).toBe(true);
  });

  it("stop working once revoked or expired", async () => {
    const [host, newcomer] = await db.createUsers("Host", "Newcomer");
    const event = await db.createBlock(host, { type: "join", audience: "custom" });

    const revoked = await createInvite(host, event);
    await db.as(host, `update public.invites set revoked_at = now() where token = $1`, [revoked]);
    expect(await db.asError(newcomer, `select public.redeem_invite($1)`, [revoked])).toMatch(/no longer valid/);

    const expired = await createInvite(host, event);
    await db.admin(`update public.invites set expires_at = now() - interval '1 minute' where token = $1`, [expired]);
    expect(await db.asError(newcomer, `select public.redeem_invite($1)`, [expired])).toMatch(/no longer valid/);
    const [preview] = await db.as<{ preview: unknown }>(null, `select public.get_invite_preview($1) as preview`, [expired]);
    expect(preview.preview).toBeNull();

    expect(await db.areConnected(host, newcomer)).toBe(false);
    expect(await db.canSee(newcomer, event)).toBe(false);
  });

  it("can only be created for your own blocks, and are private to their creator", async () => {
    const [host, guest] = await db.createUsers("Host", "Guest");
    await db.connect(host, guest);
    const event = await db.createBlock(host, { type: "join" });
    expect(await db.asError(guest, `insert into public.invites (block_id) values ($1)`, [event])).toMatch(/row-level security/);

    await createInvite(host, event);
    expect(await db.as(guest, `select 1 from public.invites`)).toHaveLength(0);
  });

  it("do not work for someone the sharer has blocked", async () => {
    const [host, blocked] = await db.createUsers("Host", "Blocked");
    const event = await db.createBlock(host, { type: "join" });
    const token = await createInvite(host, event);
    await db.as(host, `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [host, blocked]);
    expect(await db.asError(blocked, `select public.redeem_invite($1)`, [token])).toMatch(/no longer valid/);
    expect(await db.canSee(blocked, event)).toBe(false);
  });
});

describe("event page people list", () => {
  it("names the host, the people it was shared with and everyone who answered, for the audience only", async () => {
    const [host, a, b, outsider] = await db.createUsers("Hana", "Ana", "Ben", "Outsider");
    for (const guest of [a, b, outsider]) await db.connect(host, guest);
    const group = await db.createGroup(host, "Crew", [b]);
    const event = await db.createBlock(host, { type: "join", audience: "custom" });
    await db.as(host, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [event, a]);
    await db.as(host, `insert into public.block_group_shares (block_id, group_id) values ($1, $2)`, [event, group]);

    const people = await db.as(a, `select name, is_host, shared_directly, via_groups from public.get_block_people($1) order by name`, [event]);
    expect(people).toEqual([
      { name: "Ana", is_host: false, shared_directly: true, via_groups: [] },
      { name: "Ben", is_host: false, shared_directly: false, via_groups: ["Crew"] },
      { name: "Hana", is_host: true, shared_directly: false, via_groups: ["Crew"] },
    ]);

    expect(await db.as(outsider, `select * from public.get_block_people($1)`, [event])).toHaveLength(0);
  });

  it("does not list the host's whole friend list for an 'all connections' event", async () => {
    const [host, a, b] = await db.createUsers("Host", "A", "B");
    await db.connect(host, a);
    await db.connect(host, b);
    const event = await db.createBlock(host, { type: "join", audience: "all_connections" });
    const people = await db.as<{ user_id: string }>(a, `select user_id from public.get_block_people($1)`, [event]);
    expect(people.map((p) => p.user_id)).toEqual([host]);
  });
});
