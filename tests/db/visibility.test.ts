/**
 * Sharing and visibility rules, checked against the real migrations with
 * row-level security switched on.
 *
 * The promise being tested: nobody can read a block that was not shared
 * with them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb } from "./harness";

let db: TestDb;
let alex: string, mika: string, jo: string, sam: string, stranger: string;

beforeAll(async () => {
  db = await TestDb.create();
  [alex, mika, jo, sam, stranger] = await db.createUsers("Alex", "Mika", "Jo", "Sam", "Stranger");
  await db.connect(alex, mika);
  await db.connect(alex, jo);
  // sam and stranger are not connected to alex
});

afterAll(async () => {
  await db.close();
});

describe("audience: all connections", () => {
  it("is visible to the owner and every connection, and to nobody else", async () => {
    const block = await db.createBlock(alex, { audience: "all_connections" });
    expect(await db.canSee(alex, block)).toBe(true);
    expect(await db.canSee(mika, block)).toBe(true);
    expect(await db.canSee(jo, block)).toBe(true);
    expect(await db.canSee(sam, block)).toBe(false);
    expect(await db.canSee(stranger, block)).toBe(false);
  });

  it("follows the connection list as it changes", async () => {
    const [newFriend] = await db.createUsers("New friend");
    const block = await db.createBlock(alex, { audience: "all_connections" });
    expect(await db.canSee(newFriend, block)).toBe(false);

    await db.connect(alex, newFriend);
    expect(await db.canSee(newFriend, block)).toBe(true);

    await db.as(newFriend, `delete from public.connections where $1 in (user_a, user_b) and $2 in (user_a, user_b)`, [alex, newFriend]);
    expect(await db.canSee(newFriend, block)).toBe(false);
  });
});

describe("audience: custom list", () => {
  it("is visible only to the people named", async () => {
    const block = await db.createBlock(alex, { audience: "custom" });
    expect(await db.canSee(mika, block)).toBe(false);
    expect(await db.canSee(jo, block)).toBe(false);

    await db.as(alex, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [block, mika]);
    expect(await db.canSee(mika, block)).toBe(true);
    expect(await db.canSee(jo, block)).toBe(false);
    expect(await db.canSee(stranger, block)).toBe(false);
  });

  it("stops being visible when the person is taken off the list", async () => {
    const block = await db.createBlock(alex, { audience: "custom" });
    await db.as(alex, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [block, mika]);
    expect(await db.canSee(mika, block)).toBe(true);

    await db.as(alex, `delete from public.block_user_shares where block_id = $1 and user_id = $2`, [block, mika]);
    expect(await db.canSee(mika, block)).toBe(false);
  });

  it("lets a recipient take themself off the list", async () => {
    const block = await db.createBlock(alex, { audience: "custom" });
    await db.as(alex, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [block, jo]);
    await db.as(jo, `delete from public.block_user_shares where block_id = $1 and user_id = $2`, [block, jo]);
    expect(await db.canSee(jo, block)).toBe(false);
  });

  it("is visible to members of a group it is shared with, including people added later", async () => {
    const group = await db.createGroup(alex, "Climbing crew", [mika]);
    const block = await db.createBlock(alex, { audience: "custom" });
    await db.as(alex, `insert into public.block_group_shares (block_id, group_id) values ($1, $2)`, [block, group]);

    expect(await db.canSee(mika, block)).toBe(true);
    expect(await db.canSee(jo, block)).toBe(false);

    await db.as(alex, `insert into public.group_members (group_id, user_id) values ($1, $2)`, [group, jo]);
    expect(await db.canSee(jo, block)).toBe(true);

    await db.as(alex, `delete from public.group_members where group_id = $1 and user_id = $2`, [group, jo]);
    expect(await db.canSee(jo, block)).toBe(false);
  });

  it("switching from a custom list to all connections opens it up, and back again closes it", async () => {
    const block = await db.createBlock(alex, { audience: "custom" });
    expect(await db.canSee(mika, block)).toBe(false);
    await db.as(alex, `update public.blocks set audience = 'all_connections' where id = $1`, [block]);
    expect(await db.canSee(mika, block)).toBe(true);
    await db.as(alex, `update public.blocks set audience = 'custom' where id = $1`, [block]);
    expect(await db.canSee(mika, block)).toBe(false);
  });
});

describe("who may share with whom", () => {
  it("refuses to share a block with a stranger", async () => {
    const block = await db.createBlock(alex, { audience: "custom" });
    const error = await db.asError(alex, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [block, stranger]);
    expect(error).toMatch(/row-level security/);
    expect(await db.canSee(stranger, block)).toBe(false);
  });

  it("refuses to add people to someone else's block", async () => {
    const block = await db.createBlock(alex, { audience: "custom" });
    const error = await db.asError(mika, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [block, mika]);
    expect(error).toMatch(/row-level security/);
    expect(await db.canSee(mika, block)).toBe(false);
  });

  it("refuses to share with a group the sharer is not in", async () => {
    const [outsider] = await db.createUsers("Outsider");
    const group = await db.createGroup(alex, "Book club", [mika]);
    const block = await db.createBlock(outsider, { audience: "custom" });
    const error = await db.asError(outsider, `insert into public.block_group_shares (block_id, group_id) values ($1, $2)`, [block, group]);
    expect(error).toMatch(/row-level security/);
  });

  it("lets any member share with a group, not only its owner", async () => {
    const group = await db.createGroup(alex, "Run club", [mika, jo]);
    const block = await db.createBlock(mika, { audience: "custom" });
    await db.as(mika, `insert into public.block_group_shares (block_id, group_id) values ($1, $2)`, [block, group]);
    expect(await db.canSee(jo, block)).toBe(true);
    expect(await db.canSee(alex, block)).toBe(true);
  });
});

describe("only the owner can change a block", () => {
  it("ignores updates and deletes from people who can merely see it", async () => {
    const block = await db.createBlock(alex, { audience: "all_connections", title: "original" });
    await db.as(mika, `update public.blocks set title = 'hijacked' where id = $1`, [block]);
    await db.as(mika, `delete from public.blocks where id = $1`, [block]);
    const [row] = await db.admin<{ title: string }>(`select title from public.blocks where id = $1`, [block]);
    expect(row.title).toBe("original");
  });

  it("refuses to create a block in someone else's name", async () => {
    const error = await db.asError(
      mika,
      `insert into public.blocks (owner_id, type, start_at, end_at) values ($1, 'free', now(), now() + interval '1 hour')`,
      [alex],
    );
    expect(error).toMatch(/row-level security/);
  });

  it("does not let the owner hand a block to someone else", async () => {
    const block = await db.createBlock(alex);
    const error = await db.asError(alex, `update public.blocks set owner_id = $2 where id = $1`, [block, mika]);
    expect(error).toMatch(/permission denied/);
  });
});

describe("things attached to a block inherit its visibility", () => {
  it("hides share rows, RSVPs and chat from people outside the audience", async () => {
    const event = await db.createBlock(alex, { type: "join", audience: "custom" });
    await db.as(alex, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [event, mika]);
    await db.as(mika, `insert into public.rsvps (block_id, status) values ($1, 'in')`, [event]);
    await db.as(mika, `insert into public.messages (block_id, body) values ($1, 'see you there')`, [event]);

    for (const table of ["block_user_shares", "rsvps", "messages"]) {
      const outsider = await db.as(jo, `select * from public.${table} where block_id = $1`, [event]);
      expect(outsider, `${table} leaked to someone outside the audience`).toHaveLength(0);
      const insider = await db.as(mika, `select * from public.${table} where block_id = $1`, [event]);
      expect(insider.length, `${table} hidden from the audience`).toBeGreaterThan(0);
    }
  });

  it("does not show other recipients' share rows to a recipient", async () => {
    const block = await db.createBlock(alex, { audience: "custom" });
    await db.as(alex, `insert into public.block_user_shares (block_id, user_id) values ($1, $2), ($1, $3)`, [block, mika, jo]);
    const rows = await db.as<{ user_id: string }>(mika, `select user_id from public.block_user_shares where block_id = $1`, [block]);
    expect(rows.map((r) => r.user_id)).toEqual([mika]);
  });

  it("refuses RSVPs and chat from people outside the audience", async () => {
    const event = await db.createBlock(alex, { type: "join", audience: "custom" });
    expect(await db.asError(jo, `insert into public.rsvps (block_id, status) values ($1, 'in')`, [event])).toMatch(/row-level security/);
    expect(await db.asError(jo, `insert into public.messages (block_id, body) values ($1, 'hi')`, [event])).toMatch(/row-level security/);
  });
});

describe("signed-out visitors", () => {
  it("cannot read any table", async () => {
    await db.createBlock(alex);
    for (const table of ["blocks", "profiles", "connections", "groups", "rsvps", "messages", "notifications", "invites"]) {
      const error = await db.asError(null, `select * from public.${table}`);
      expect(error, `anon could read ${table}`).toMatch(/permission denied/);
    }
  });

  it("cannot call signed-in functions", async () => {
    expect(await db.asError(null, `select public.get_mutuals()`)).toMatch(/permission denied/);
    expect(await db.asError(null, `select public.connect_with($1)`, [alex])).toMatch(/permission denied/);
  });
});

describe("profiles", () => {
  it("are visible to self, connections and mutuals only", async () => {
    const visibleTo = async (viewer: string) =>
      (await db.as<{ id: string }>(viewer, `select id from public.profiles`)).map((r) => r.id);

    expect(await visibleTo(stranger)).toEqual([stranger]);
    const mikaSees = await visibleTo(mika);
    expect(mikaSees).toContain(alex);
    expect(mikaSees).not.toContain(stranger);
  });

  it("can only be edited by their owner, and only name and picture", async () => {
    await db.as(mika, `update public.profiles set name = 'Hacked' where id = $1`, [alex]);
    const [row] = await db.admin<{ name: string }>(`select name from public.profiles where id = $1`, [alex]);
    expect(row.name).toBe("Alex");

    await db.as(alex, `update public.profiles set name = 'Alex D' where id = $1`, [alex]);
    const [after] = await db.admin<{ name: string }>(`select name from public.profiles where id = $1`, [alex]);
    expect(after.name).toBe("Alex D");

    expect(await db.asError(alex, `update public.profiles set id = gen_random_uuid() where id = $1`, [alex])).toMatch(/permission denied/);
  });
});

describe("avatar storage", () => {
  it("only allows writing inside your own folder", async () => {
    await db.as(alex, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${alex}/me.jpg`]);
    const error = await db.asError(alex, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${mika}/me.jpg`]);
    expect(error).toMatch(/row-level security/);
  });
});
