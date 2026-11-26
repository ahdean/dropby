/**
 * A chat in every time block: the open group chat (per week, Free time too)
 * and private conversations inside a block.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb } from "./harness";

let db: TestDb;
let host: string, mika: string, jo: string, sam: string, outsider: string;

beforeAll(async () => {
  db = await TestDb.create();
  [host, mika, jo, sam, outsider] = await db.createUsers("Hana", "Mika", "Jo", "Sam", "Olu");
  // Mika, Jo and Sam are Hana's connections; Olu is not. Mika and Jo don't know each other.
  await db.connect(host, mika);
  await db.connect(host, jo);
  await db.connect(host, sam);
});

afterAll(async () => {
  await db.close();
});

const say = (user: string, blockId: string, body: string, occurrence = 0) =>
  db.asError(user, `insert into public.messages (block_id, occurrence, body) values ($1, $2, $3)`, [blockId, occurrence, body]);
const thread = async (viewer: string, blockId: string, occurrence = 0) =>
  (
    await db.as<{ body: string }>(
      viewer,
      `select body from public.messages where block_id = $1 and occurrence = $2 order by created_at, body`,
      [blockId, occurrence],
    )
  ).map((r) => r.body);

const whisper = (from: string, to: string, blockId: string, body: string, occurrence = 0) =>
  db.asError(
    from,
    `insert into public.block_private_messages (block_id, occurrence, recipient_id, body) values ($1, $2, $3, $4)`,
    [blockId, occurrence, to, body],
  );
const privateThread = async (viewer: string, blockId: string) =>
  (await db.as<{ body: string }>(viewer, `select body from public.block_private_messages where block_id = $1 order by created_at, body`, [blockId])).map(
    (r) => r.body,
  );

describe("the group chat in a block", () => {
  it("works for Free time as well as hosted events", async () => {
    const free = await db.createBlock(host, { type: "free" });
    expect(await say(mika, free, "Fancy a walk?")).toBeNull();
    expect(await say(host, free, "Yes! 6pm?")).toBeNull();
    expect(await thread(jo, free)).toEqual(["Fancy a walk?", "Yes! 6pm?"]);
  });

  it("is closed to people the block is not shared with", async () => {
    const free = await db.createBlock(host, { type: "free" });
    expect(await say(outsider, free, "hi")).toMatch(/row-level security/);
    expect(await thread(outsider, free)).toEqual([]);
  });

  it("is separate for each week of a weekly repeat", async () => {
    const weekly = await db.createBlock(host, { type: "join", repeat_weekly: true });
    await say(mika, weekly, "this week", 0);
    await say(mika, weekly, "next week", 1);
    expect(await thread(host, weekly, 0)).toEqual(["this week"]);
    expect(await thread(host, weekly, 1)).toEqual(["next week"]);
  });

  it("tells the host which week was written in", async () => {
    const weekly = await db.createBlock(host, { type: "free", repeat_weekly: true });
    await say(sam, weekly, "free on the 3rd week too?", 2);
    const [note] = await db.as<{ type: string; occurrence: number }>(
      host,
      `select type, occurrence from public.notifications where type = 'chat' and block_id = $1`,
      [weekly],
    );
    expect(note).toEqual({ type: "chat", occurrence: 2 });
  });
});

describe("private messages inside a block", () => {
  it("let a guest and the host write to each other, and nobody else can read them", async () => {
    const free = await db.createBlock(host, { type: "free" });
    expect(await whisper(mika, host, free, "Just us?")).toBeNull();
    expect(await whisper(host, mika, free, "Sure")).toBeNull();
    expect(await privateThread(mika, free)).toEqual(["Just us?", "Sure"]);
    expect(await privateThread(host, free)).toEqual(["Just us?", "Sure"]);
    expect(await privateThread(jo, free)).toEqual([]);
    expect(await thread(jo, free)).toEqual([]); // not in the group chat either
  });

  it("let the host write to anyone the block is shared with", async () => {
    const free = await db.createBlock(host, { type: "free" });
    expect(await whisper(host, sam, free, "You around?")).toBeNull();
  });

  it("don't let a guest message another guest who isn't taking part", async () => {
    const event = await db.createBlock(host, { type: "join" });
    // Jo can see the event but hasn't answered, chatted or been named: off limits to Mika.
    expect(await whisper(mika, jo, event, "hi stranger")).toMatch(/row-level security/);
    // Once Jo writes in the group chat, Mika can write to Jo privately…
    await say(jo, event, "I'll bring cake");
    expect(await whisper(mika, jo, event, "Which cake?")).toBeNull();
    // …and Jo can answer.
    expect(await whisper(jo, mika, event, "Lemon")).toBeNull();
  });

  it("allow a reply to someone who wrote first", async () => {
    const event = await db.createBlock(host, { type: "join" });
    await db.as(sam, `insert into public.rsvps (block_id, occurrence, status) values ($1, 0, 'in')`, [event]);
    // Sam took part, so Jo may write to Sam; Sam may answer although Jo hasn't taken part publicly.
    expect(await whisper(jo, sam, event, "Carpool?")).toBeNull();
    expect(await whisper(sam, jo, event, "Yes")).toBeNull();
  });

  it("never reach someone who can't see the block, or who blocked the sender", async () => {
    const free = await db.createBlock(host, { type: "free" });
    expect(await whisper(host, outsider, free, "hi")).toMatch(/row-level security/);
    expect(await whisper(outsider, host, free, "hi")).toMatch(/row-level security/);

    const event = await db.createBlock(host, { type: "join" });
    await db.as(sam, `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [sam, host]);
    expect(await whisper(host, sam, event, "hello?")).toMatch(/row-level security/);
    await db.as(sam, `delete from public.user_blocks where blocked_id = $1`, [host]);
  });

  it("can be marked read only by the person they were sent to", async () => {
    const free = await db.createBlock(host, { type: "free" });
    await whisper(mika, host, free, "read me");
    await db.as(mika, `update public.block_private_messages set read_at = now() where block_id = $1`, [free]);
    const [stillUnread] = await db.admin<{ read_at: string | null }>(`select read_at from public.block_private_messages where block_id = $1`, [free]);
    expect(stillUnread.read_at).toBeNull();
    await db.as(host, `update public.block_private_messages set read_at = now() where block_id = $1`, [free]);
    const [read] = await db.admin<{ read_at: string | null }>(`select read_at from public.block_private_messages where block_id = $1`, [free]);
    expect(read.read_at).not.toBeNull();
  });

  it("ring the recipient's bell, once per person and block", async () => {
    const free = await db.createBlock(host, { type: "free", repeat_weekly: true });
    await whisper(jo, host, free, "one", 1);
    await whisper(jo, host, free, "two", 1);
    const notes = await db.as<{ type: string; occurrence: number; data: { preview: string } }>(
      host,
      `select type, occurrence, data from public.notifications where type = 'block_dm' and block_id = $1`,
      [free],
    );
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ occurrence: 1, data: { preview: "two" } });
  });

  it("are not open to signed-out visitors", async () => {
    expect(await db.asError(null, `select 1 from public.block_private_messages`)).toMatch(/permission denied/);
  });
});
