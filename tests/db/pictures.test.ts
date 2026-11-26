/**
 * Event pictures (only the host's own uploads, shown in the invite preview)
 * and places hidden from "Used before" (private to their owner).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb } from "./harness";

let db: TestDb;
let alex: string, mika: string;

beforeAll(async () => {
  db = await TestDb.create();
  [alex, mika] = await db.createUsers("Alex", "Mika");
  await db.connect(alex, mika);
});

afterAll(async () => {
  await db.close();
});

const setPicture = (user: string, blockId: string, path: string | null) =>
  db.asError(user, `update public.blocks set picture_path = $1 where id = $2`, [path, blockId]);

describe("event pictures", () => {
  it("can be a file in the host's own folder", async () => {
    const event = await db.createBlock(alex, { type: "join" });
    expect(await setPicture(alex, event, `${alex}/1732650000000-a1b2.jpg`)).toBeNull();
    const [row] = await db.as<{ picture_path: string }>(mika, `select picture_path from public.blocks where id = $1`, [event]);
    expect(row.picture_path).toBe(`${alex}/1732650000000-a1b2.jpg`);
    expect(await setPicture(alex, event, null)).toBeNull();
  });

  it("cannot point at someone else's folder, another website, or a strange name", async () => {
    const event = await db.createBlock(alex, { type: "join" });
    for (const path of [
      `${mika}/photo.jpg`,
      "https://example.com/tracker.png",
      `${alex}/../${mika}/photo.jpg`,
      `${alex}/sub/photo.jpg`,
      `${alex}/photo.gif`,
      `${alex}/photo.jpg?x=1`,
    ]) {
      expect(await setPicture(alex, event, path), path).toMatch(/blocks_picture_path_own_folder/);
    }
  });

  it("can only be changed by the host", async () => {
    const event = await db.createBlock(alex, { type: "join" });
    await setPicture(mika, event, `${mika}/photo.jpg`);
    const [row] = await db.admin<{ picture_path: string | null }>(`select picture_path from public.blocks where id = $1`, [event]);
    expect(row.picture_path).toBeNull();
  });

  it("are shown in the invite preview", async () => {
    const event = await db.createBlock(alex, { type: "join", title: "Picnic" });
    await setPicture(alex, event, `${alex}/picnic.jpg`);
    const [invite] = await db.as<{ token: string }>(alex, `insert into public.invites (block_id) values ($1) returning token`, [event]);
    const [row] = await db.as<{ preview: { block: Record<string, unknown> } }>(null, `select public.get_invite_preview($1) as preview`, [invite.token]);
    expect(row.preview.block).toMatchObject({ title: "Picnic", picture_path: `${alex}/picnic.jpg` });
  });

  it("are stored in a bucket where people may only upload into their own folder", async () => {
    const [bucket] = await db.admin<{ public: boolean }>(`select public from storage.buckets where id = 'event-pictures'`);
    expect(bucket.public).toBe(true);
    expect(await db.asError(alex, `insert into storage.objects (bucket_id, name) values ('event-pictures', $1)`, [`${alex}/x.jpg`])).toBeNull();
    expect(await db.asError(alex, `insert into storage.objects (bucket_id, name) values ('event-pictures', $1)`, [`${mika}/x.jpg`])).toMatch(
      /row-level security/,
    );
  });
});

describe("places hidden from 'Used before'", () => {
  const hidden = async (viewer: string) =>
    (await db.as<{ place_key: string }>(viewer, `select place_key from public.hidden_places order by place_key`)).map((r) => r.place_key);

  it("can be hidden and brought back by their owner", async () => {
    await db.as(alex, `insert into public.hidden_places (place_key) values ('old flat, 3 oak st'), ('the pub')`);
    expect(await hidden(alex)).toEqual(["old flat, 3 oak st", "the pub"]);
    await db.as(alex, `delete from public.hidden_places where place_key = 'the pub'`);
    expect(await hidden(alex)).toEqual(["old flat, 3 oak st"]);
  });

  it("are private, even from connections", async () => {
    expect(await hidden(mika)).toEqual([]);
    expect(await db.asError(mika, `insert into public.hidden_places (owner_id, place_key) values ($1, 'x')`, [alex])).toMatch(
      /row-level security/,
    );
    await db.as(mika, `delete from public.hidden_places where owner_id = $1`, [alex]);
    expect(await hidden(alex)).toEqual(["old flat, 3 oak st"]);
  });

  it("are listed once each", async () => {
    expect(await db.asError(alex, `insert into public.hidden_places (place_key) values ('old flat, 3 oak st')`)).toMatch(/duplicate key/);
  });
});
