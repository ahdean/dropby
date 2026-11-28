/**
 * Activities (a private list, with favourite spots), place types, ideas on
 * Free time and "I'm up for this".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb } from "./harness";

let db: TestDb;
let alex: string, mika: string, jo: string, outsider: string;

beforeAll(async () => {
  db = await TestDb.create();
  [alex, mika, jo, outsider] = await db.createUsers("Alex", "Mika", "Jo", "Olu");
  await db.connect(alex, mika);
  await db.connect(alex, jo);
});

afterAll(async () => {
  await db.close();
});

const addPlace = async (owner: string, name: string, kind: string | null = null) =>
  (await db.as<{ id: string }>(owner, `insert into public.saved_places (name, address, kind) values ($1, $1, $2) returning id`, [name, kind]))[0].id;

const addActivity = async (owner: string, name: string, kinds: string[] = [], placeIds: string[] = []) =>
  (
    await db.as<{ id: string; place_ids: string[] }>(
      owner,
      `insert into public.activities (name, emoji, place_kinds, place_ids) values ($1, '🥞', $2, $3) returning id, place_ids`,
      [name, kinds, placeIds],
    )
  )[0];

const IDEAS = JSON.stringify([
  { id: "a1", title: "Brunch", emoji: "🥞", kind: "Restaurant" },
  { id: "a2", title: "Park hang", emoji: "🌳", kind: "Park", place: "Prospect Park" },
]);

const freeWithIdeas = async (owner: string, ideas = IDEAS, fields: Parameters<TestDb["createBlock"]>[1] = {}) => {
  const id = await db.createBlock(owner, { type: "free", ...fields });
  await db.as(owner, `update public.blocks set ideas = $2::jsonb where id = $1`, [id, ideas]);
  return id;
};

const pick = (user: string, blockId: string, ideaId: string, occurrence = 0) =>
  db.asError(user, `insert into public.idea_votes (block_id, occurrence, idea_id) values ($1, $2, $3)`, [blockId, occurrence, ideaId]);

const picks = async (viewer: string, blockId: string) =>
  (
    await db.as<{ idea_id: string; user_id: string }>(
      viewer,
      `select idea_id, user_id from public.idea_votes where block_id = $1 order by idea_id, user_id`,
      [blockId],
    )
  )
    .map((r) => `${r.idea_id}:${r.user_id === alex ? "alex" : r.user_id === mika ? "mika" : r.user_id === jo ? "jo" : "other"}`)
    .sort();

describe("place types", () => {
  it("can be set on a saved place and changed by its owner", async () => {
    const home = await addPlace(alex, "Home", "House");
    await db.as(alex, `update public.saved_places set kind = 'Rooftop' where id = $1`, [home]);
    const [row] = await db.as<{ kind: string }>(alex, `select kind from public.saved_places where id = $1`, [home]);
    expect(row.kind).toBe("Rooftop");
    expect(await db.asError(alex, `update public.saved_places set kind = $2 where id = $1`, [home, "x".repeat(31)])).toMatch(/kind_check/);
  });
});

describe("activities", () => {
  it("are private to their owner", async () => {
    await addActivity(alex, "Book club", ["House", "Park"]);
    expect((await db.as(mika, `select * from public.activities`)).length).toBe(0);
    expect(await db.asError(null, `select * from public.activities`)).toMatch(/permission denied/);
    const forged = await db.asError(mika, `insert into public.activities (owner_id, name) values ($1, 'Planted')`, [alex]);
    expect(forged).toMatch(/row-level security/);
  });

  it("can be renamed and edited only by their owner", async () => {
    const { id } = await addActivity(alex, "Dinner", ["Restaurant"]);
    await db.as(mika, `update public.activities set name = 'hijacked' where id = $1`, [id]);
    await db.as(mika, `delete from public.activities where id = $1`, [id]);
    await db.as(alex, `update public.activities set name = 'Late dinner', place_kinds = '{Restaurant,House}' where id = $1`, [id]);
    const [row] = await db.admin<{ name: string; place_kinds: string[] }>(`select name, place_kinds from public.activities where id = $1`, [id]);
    expect(row).toEqual({ name: "Late dinner", place_kinds: ["Restaurant", "House"] });
  });

  it("need a name, used once per person, and short place types", async () => {
    expect(await db.asError(alex, `insert into public.activities (name) values ('  ')`)).toMatch(/activities_name_check/);
    await addActivity(alex, "Potluck");
    expect(await db.asError(alex, `insert into public.activities (name) values (' potluck ')`)).toMatch(/activities_owner_name_uniq/);
    await addActivity(mika, "Potluck"); // someone else may have one too
    expect(await db.asError(alex, `insert into public.activities (name, place_kinds) values ('Odd', $1)`, [["x".repeat(31)]])).toMatch(
      /place_kinds_check/,
    );
    expect(await db.asError(alex, `insert into public.activities (name, place_kinds) values ('Odd', '{" "}')`)).toMatch(/place_kinds_check/);
  });

  it("keep only the owner's own saved places as favourite spots, each once", async () => {
    const mine = await addPlace(alex, "Joe's Diner", "Restaurant");
    const theirs = await addPlace(mika, "Mika's flat", "House");
    const { place_ids } = await addActivity(alex, "Brunch", ["Restaurant"], [mine, theirs, mine]);
    expect(place_ids).toEqual([mine]);
  });

  it("lose a favourite spot when that saved place is deleted", async () => {
    const cafe = await addPlace(alex, "Corner café", "Café");
    const park = await addPlace(alex, "Riverside", "Park");
    const { id } = await addActivity(alex, "Coffee walk", ["Café", "Park"], [cafe, park]);
    await db.as(alex, `delete from public.saved_places where id = $1`, [cafe]);
    const [row] = await db.as<{ place_ids: string[] }>(alex, `select place_ids from public.activities where id = $1`, [id]);
    expect(row.place_ids).toEqual([park]);
  });

  it("are capped at 100 per person", async () => {
    const [keen] = await db.createUsers("Keen");
    for (let i = 0; i < 100; i++) await addActivity(keen, `Thing ${i}`);
    expect(await db.asError(keen, `insert into public.activities (name) values ('One more')`)).toMatch(/up to 100 activities/);
  });
});

describe("ideas on a block", () => {
  it("are seen by everyone who can see the block, and nobody else", async () => {
    const block = await freeWithIdeas(alex);
    const [seen] = await db.as<{ ideas: { title: string }[] }>(mika, `select ideas from public.blocks where id = $1`, [block]);
    expect(seen.ideas.map((i) => i.title)).toEqual(["Brunch", "Park hang"]);
    expect(await db.as(outsider, `select ideas from public.blocks where id = $1`, [block])).toEqual([]);
  });

  it("start empty, and can only be changed by the owner", async () => {
    const block = await db.createBlock(alex, { type: "free" });
    const [row] = await db.as<{ ideas: unknown[] }>(alex, `select ideas from public.blocks where id = $1`, [block]);
    expect(row.ideas).toEqual([]);
    await db.as(mika, `update public.blocks set ideas = $2::jsonb where id = $1`, [block, IDEAS]);
    const [after] = await db.admin<{ ideas: unknown[] }>(`select ideas from public.blocks where id = $1`, [block]);
    expect(after.ideas).toEqual([]);
  });

  it("are checked: at most 6, each with its own id and a title", async () => {
    const block = await db.createBlock(alex, { type: "free" });
    const set = (ideas: unknown) => db.asError(alex, `update public.blocks set ideas = $2::jsonb where id = $1`, [block, JSON.stringify(ideas)]);
    const idea = (id: string, extra: object = {}) => ({ id, title: "Brunch", ...extra });
    expect(await set([idea("1"), idea("2"), idea("3"), idea("4"), idea("5"), idea("6")])).toBeNull();
    expect(await set([idea("1"), idea("2"), idea("3"), idea("4"), idea("5"), idea("6"), idea("7")])).toMatch(/ideas_check/);
    expect(await set([idea("1"), idea("1")])).toMatch(/ideas_check/);
    expect(await set([{ id: "1", title: " " }])).toMatch(/ideas_check/);
    expect(await set([{ id: "1" }])).toMatch(/ideas_check/);
    expect(await set([idea("1", { place: "x".repeat(201) })])).toMatch(/ideas_check/);
    expect(await set([idea("1", { emoji: 5 })])).toMatch(/ideas_check/);
    expect(await set({ id: "1", title: "Not a list" })).toMatch(/ideas_check/);
    expect(await set([idea("1", { emoji: null, kind: null, place: "Prospect Park" })])).toBeNull();
  });
});

describe("I'm up for this", () => {
  it("friends who can see the block pick ideas; everyone who can see it sees the picks", async () => {
    const block = await freeWithIdeas(alex);
    expect(await pick(mika, block, "a1")).toBeNull();
    expect(await pick(jo, block, "a1")).toBeNull();
    expect(await pick(jo, block, "a2")).toBeNull();
    expect(await picks(alex, block)).toEqual(["a1:jo", "a1:mika", "a2:jo"].sort());
    expect(await picks(mika, block)).toEqual(["a1:jo", "a1:mika", "a2:jo"].sort());
    expect(await picks(outsider, block)).toEqual([]);
  });

  it("are not open to outsiders, to the owner, to ideas that aren't there, or to someone else's name", async () => {
    const block = await freeWithIdeas(alex);
    expect(await pick(outsider, block, "a1")).toMatch(/row-level security/);
    expect(await pick(alex, block, "a1")).toMatch(/row-level security/);
    expect(await pick(mika, block, "nope")).toMatch(/row-level security/);
    const forged = await db.asError(mika, `insert into public.idea_votes (block_id, idea_id, user_id) values ($1, 'a1', $2)`, [block, jo]);
    expect(forged).toMatch(/row-level security/);
  });

  it("only work on Free time", async () => {
    const event = await db.createBlock(alex, { type: "join" });
    await db.as(alex, `update public.blocks set ideas = $2::jsonb where id = $1`, [event, IDEAS]);
    expect(await pick(mika, event, "a1")).toMatch(/row-level security/);
  });

  it("can be taken back, but only by the person who picked", async () => {
    const block = await freeWithIdeas(alex);
    await pick(mika, block, "a1");
    await db.as(jo, `delete from public.idea_votes where block_id = $1`, [block]);
    expect(await picks(alex, block)).toEqual(["a1:mika"]);
    await db.as(mika, `delete from public.idea_votes where block_id = $1 and idea_id = 'a1'`, [block]);
    expect(await picks(alex, block)).toEqual([]);
  });

  it("are counted separately for each week of a weekly repeat", async () => {
    const block = await freeWithIdeas(alex, IDEAS, { repeat_weekly: true });
    expect(await pick(mika, block, "a1", 0)).toBeNull();
    expect(await pick(mika, block, "a1", 3)).toBeNull();
    expect(await pick(mika, block, "a1", 3)).toMatch(/duplicate key/);
    const rows = await db.as<{ occurrence: number }>(alex, `select occurrence from public.idea_votes where block_id = $1 order by occurrence`, [block]);
    expect(rows.map((r) => r.occurrence)).toEqual([0, 3]);
  });

  it("go when their idea is taken off the block", async () => {
    const block = await freeWithIdeas(alex);
    await pick(mika, block, "a1");
    await pick(mika, block, "a2");
    await db.as(alex, `update public.blocks set ideas = $2::jsonb where id = $1`, [block, JSON.stringify([{ id: "a2", title: "Park hang" }])]);
    expect(await picks(alex, block)).toEqual(["a2:mika"]);
  });

  it("are hidden once the person who picked can no longer see the block", async () => {
    const block = await freeWithIdeas(alex);
    await pick(jo, block, "a1");
    await db.admin(`update public.blocks set audience = 'custom' where id = $1`, [block]);
    await db.admin(`insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [block, mika]);
    expect(await picks(alex, block)).toEqual([]);
    expect(await pick(mika, block, "a2")).toBeNull();
    expect(await picks(alex, block)).toEqual(["a2:mika"]);
  });

  it("tell the owner, once per block while unread, naming the latest person and idea", async () => {
    const block = await freeWithIdeas(alex);
    await pick(mika, block, "a1");
    await pick(jo, block, "a2");
    const rows = await db.as<{ actor_id: string; data: { preview: string; idea_emoji: string; actor_name: string } }>(
      alex,
      `select actor_id, data from public.notifications where type = 'idea_vote' and block_id = $1`,
      [block],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBe(jo);
    expect(rows[0].data).toMatchObject({ preview: "Park hang", idea_emoji: "🌳", actor_name: "Jo" });
    // Nobody else is told.
    expect(await db.as(mika, `select 1 from public.notifications where type = 'idea_vote' and block_id = $1`, [block])).toEqual([]);
  });
});
