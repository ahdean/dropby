/**
 * Connection and mutual logic.
 *
 *   Connection: two users where one has shared an event with the other.
 *   Mutual:     two users who have been invited to the same group.
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

const mutualIds = async (viewer: string) =>
  (await db.as<{ id: string }>(viewer, `select id from public.get_mutuals()`)).map((r) => r.id);

describe("connections are created by sharing", () => {
  it("clients cannot insert a connection directly", async () => {
    const [a, b] = await db.createUsers("A", "B");
    const error = await db.asError(
      a,
      `insert into public.connections (user_a, user_b) values (least($1::uuid, $2::uuid), greatest($1::uuid, $2::uuid))`,
      [a, b],
    );
    expect(error).toMatch(/permission denied/);
    expect(await db.areConnected(a, b)).toBe(false);
  });

  it("sharing a block with a mutual makes the two connections", async () => {
    const [owner, a, b] = await db.createUsers("Owner", "A", "B");
    await db.connect(owner, a);
    await db.connect(owner, b);
    await db.createGroup(owner, "Crew", [a, b]);
    expect(await db.areConnected(a, b)).toBe(false);

    const block = await db.createBlock(a, { audience: "custom" });
    await db.as(a, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [block, b]);

    expect(await db.areConnected(a, b)).toBe(true);
    expect(await db.canSee(b, block)).toBe(true);
  });

  it("sharing with a group connects the sharer to every member, and to people who join later", async () => {
    const [owner, a, b, late] = await db.createUsers("Owner", "A", "B", "Late");
    for (const friend of [a, b, late]) await db.connect(owner, friend);
    const group = await db.createGroup(owner, "Crew", [a, b]);

    const block = await db.createBlock(a, { type: "join", audience: "custom" });
    await db.as(a, `insert into public.block_group_shares (block_id, group_id) values ($1, $2)`, [block, group]);
    expect(await db.areConnected(a, b)).toBe(true);
    expect(await db.areConnected(a, late)).toBe(false);

    await db.as(owner, `insert into public.group_members (group_id, user_id) values ($1, $2)`, [group, late]);
    expect(await db.areConnected(a, late)).toBe(true);
    // b never shared anything with late, so they stay mutuals
    expect(await db.areConnected(b, late)).toBe(false);
  });

  it("each pair is stored once, whichever way round it is created", async () => {
    const [a, b] = await db.createUsers("A", "B");
    await db.connect(a, b);
    await db.connect(b, a);
    const rows = await db.admin(`select 1 from public.connections where $1 in (user_a, user_b) and $2 in (user_a, user_b)`, [a, b]);
    expect(rows).toHaveLength(1);
  });

  it("both sides can see the connection; other people cannot", async () => {
    const [a, b, c] = await db.createUsers("A", "B", "C");
    await db.connect(a, b);
    expect(await db.as(a, `select 1 from public.connections`)).toHaveLength(1);
    expect(await db.as(b, `select 1 from public.connections`)).toHaveLength(1);
    expect(await db.as(c, `select 1 from public.connections`)).toHaveLength(0);
  });
});

describe("removing a connection", () => {
  it("can be done by either side and withdraws what the two shared directly", async () => {
    const [a, b] = await db.createUsers("A", "B");
    await db.connect(a, b);
    const everyone = await db.createBlock(a, { audience: "all_connections" });
    const direct = await db.createBlock(a, { type: "join", audience: "custom" });
    await db.as(a, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [direct, b]);
    await db.as(b, `insert into public.rsvps (block_id, status) values ($1, 'in')`, [direct]);
    const group = await db.createGroup(a, "A's people", [b]);

    await db.as(b, `delete from public.connections where $1 in (user_a, user_b) and $2 in (user_a, user_b)`, [a, b]);

    expect(await db.areConnected(a, b)).toBe(false);
    expect(await db.canSee(b, everyone)).toBe(false);
    expect(await db.canSee(b, direct)).toBe(false);
    expect(await db.admin(`select 1 from public.rsvps where block_id = $1`, [direct])).toHaveLength(0);
    expect(await db.admin(`select 1 from public.group_members where group_id = $1 and user_id = $2`, [group, b])).toHaveLength(0);
  });

  it("cannot be done by a third person", async () => {
    const [a, b, c] = await db.createUsers("A", "B", "C");
    await db.connect(a, b);
    await db.as(c, `delete from public.connections`);
    expect(await db.areConnected(a, b)).toBe(true);
  });
});

describe("mutuals", () => {
  it("are people in a shared group who are not yet connections", async () => {
    const [owner, a, b, outsider] = await db.createUsers("Owner", "A", "B", "Outsider");
    await db.connect(owner, a);
    await db.connect(owner, b);
    await db.createGroup(owner, "Crew", [a, b]);

    expect(await mutualIds(a)).toEqual([b]);
    expect(await mutualIds(b)).toEqual([a]);
    expect(await mutualIds(owner)).toEqual([]); // already connected to both
    expect(await mutualIds(outsider)).toEqual([]);
  });

  it("show name, avatar and the shared group names, and nothing else", async () => {
    const [owner, a, b] = await db.createUsers("Owner", "Ada", "Bea");
    await db.connect(owner, a);
    await db.connect(owner, b);
    await db.createGroup(owner, "Crew", [a, b]);
    await db.createGroup(owner, "Brunch", [a, b]);

    const rows = await db.as(a, `select * from public.get_mutuals()`);
    expect(rows).toEqual([{ id: b, name: "Bea", avatar_url: null, group_names: ["Brunch", "Crew"] }]);
  });

  it("cannot see each other's blocks until something is shared", async () => {
    const [owner, a, b] = await db.createUsers("Owner", "A", "B");
    await db.connect(owner, a);
    await db.connect(owner, b);
    await db.createGroup(owner, "Crew", [a, b]);
    const block = await db.createBlock(a, { audience: "all_connections" });
    expect(await db.canSee(b, block)).toBe(false);
    // …but can see each other's profile (name and avatar)
    const profiles = await db.as<{ id: string }>(b, `select id from public.profiles where id = $1`, [a]);
    expect(profiles).toHaveLength(1);
  });

  it("become connections with the Connect button, which also tells the other person", async () => {
    const [owner, a, b] = await db.createUsers("Owner", "Ada", "Bea");
    await db.connect(owner, a);
    await db.connect(owner, b);
    await db.createGroup(owner, "Crew", [a, b]);
    const block = await db.createBlock(a, { audience: "all_connections" });

    const [result] = await db.as<{ connect_with: boolean }>(b, `select public.connect_with($1)`, [a]);
    expect(result.connect_with).toBe(true);
    expect(await db.areConnected(a, b)).toBe(true);
    expect(await db.canSee(b, block)).toBe(true);
    expect(await mutualIds(a)).toEqual([]);

    const bell = await db.notifications(a);
    expect(bell.filter((n) => n.type === "connected")).toMatchObject([{ actor_id: b, data: { actor_name: "Bea" } }]);

    // pressing it twice is harmless
    const [again] = await db.as<{ connect_with: boolean }>(b, `select public.connect_with($1)`, [a]);
    expect(again.connect_with).toBe(false);
  });

  it("the Connect button does not work on strangers", async () => {
    const [a, stranger] = await db.createUsers("A", "Stranger");
    const error = await db.asError(a, `select public.connect_with($1)`, [stranger]);
    expect(error).toMatch(/share a group/);
    expect(await db.areConnected(a, stranger)).toBe(false);
  });

  it("stop being mutuals when one of them leaves the group", async () => {
    const [owner, a, b] = await db.createUsers("Owner", "A", "B");
    await db.connect(owner, a);
    await db.connect(owner, b);
    const group = await db.createGroup(owner, "Crew", [a, b]);
    await db.as(b, `delete from public.group_members where group_id = $1 and user_id = $2`, [group, b]);
    expect(await mutualIds(a)).toEqual([]);
  });
});

describe("groups", () => {
  it("the owner is automatically a member", async () => {
    const [owner] = await db.createUsers("Owner");
    const group = await db.createGroup(owner, "Solo");
    const members = await db.as<{ user_id: string }>(owner, `select user_id from public.group_members where group_id = $1`, [group]);
    expect(members.map((m) => m.user_id)).toEqual([owner]);
  });

  it("only the owner adds people, and only their own connections", async () => {
    const [owner, friend, member, stranger] = await db.createUsers("Owner", "Friend", "Member", "Stranger");
    await db.connect(owner, friend);
    await db.connect(owner, member);
    await db.connect(member, stranger);
    const group = await db.createGroup(owner, "Crew", [member]);

    // owner cannot add someone they are not connected to
    expect(await db.asError(owner, `insert into public.group_members (group_id, user_id) values ($1, $2)`, [group, stranger])).toMatch(/row-level security/);
    // a member cannot add their own friend
    expect(await db.asError(member, `insert into public.group_members (group_id, user_id) values ($1, $2)`, [group, stranger])).toMatch(/row-level security/);
    // nobody can add themself
    expect(await db.asError(friend, `insert into public.group_members (group_id, user_id) values ($1, $2)`, [group, friend])).toMatch(/row-level security/);
  });

  it("are invisible to non-members", async () => {
    const [owner, member, outsider] = await db.createUsers("Owner", "Member", "Outsider");
    await db.connect(owner, member);
    await db.connect(owner, outsider);
    await db.createGroup(owner, "Secret", [member]);
    expect(await db.as(member, `select 1 from public.groups`)).toHaveLength(1);
    expect(await db.as(outsider, `select 1 from public.groups`)).toHaveLength(0);
    expect(await db.as(outsider, `select 1 from public.group_members`)).toHaveLength(0);
  });

  it("adding someone tells them; a member can leave but not remove others; leaving withdraws what they shared", async () => {
    const [owner, a, b] = await db.createUsers("Owner", "A", "B");
    await db.connect(owner, a);
    await db.connect(owner, b);
    const group = await db.createGroup(owner, "Crew", [a, b]);

    expect((await db.notifications(a)).filter((n) => n.type === "group_added")).toMatchObject([
      { group_id: group, data: { group_name: "Crew", actor_name: "Owner" } },
    ]);

    const block = await db.createBlock(a, { audience: "custom" });
    await db.as(a, `insert into public.block_group_shares (block_id, group_id) values ($1, $2)`, [block, group]);

    // a cannot remove b
    await db.as(a, `delete from public.group_members where group_id = $1 and user_id = $2`, [group, b]);
    expect(await db.admin(`select 1 from public.group_members where group_id = $1 and user_id = $2`, [group, b])).toHaveLength(1);

    // a leaves: the block a shared with the group is withdrawn from it
    await db.as(a, `delete from public.group_members where group_id = $1 and user_id = $2`, [group, a]);
    expect(await db.admin(`select 1 from public.block_group_shares where block_id = $1`, [block])).toHaveLength(0);
  });

  it("the owner cannot leave their own group, but can delete it", async () => {
    const [owner, a] = await db.createUsers("Owner", "A");
    await db.connect(owner, a);
    const group = await db.createGroup(owner, "Crew", [a]);
    await db.as(owner, `delete from public.group_members where group_id = $1 and user_id = $2`, [group, owner]);
    expect(await db.admin(`select 1 from public.group_members where group_id = $1 and user_id = $2`, [group, owner])).toHaveLength(1);

    // a member cannot delete the group
    await db.as(a, `delete from public.groups where id = $1`, [group]);
    expect(await db.admin(`select 1 from public.groups where id = $1`, [group])).toHaveLength(1);

    await db.as(owner, `delete from public.groups where id = $1`, [group]);
    expect(await db.admin(`select 1 from public.groups where id = $1`, [group])).toHaveLength(0);
    expect(await db.admin(`select 1 from public.group_members where group_id = $1`, [group])).toHaveLength(0);
  });
});

describe("blocking a person", () => {
  it("hides everything in both directions and removes the connection", async () => {
    const [a, b] = await db.createUsers("A", "B");
    await db.connect(a, b);
    const aBlock = await db.createBlock(a, { audience: "all_connections" });
    const bBlock = await db.createBlock(b, { audience: "all_connections" });

    await db.as(a, `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]);

    expect(await db.areConnected(a, b)).toBe(false);
    expect(await db.canSee(b, aBlock)).toBe(false);
    expect(await db.canSee(a, bBlock)).toBe(false);
    // the blocked person can no longer see the blocker's profile…
    expect(await db.as(b, `select 1 from public.profiles where id = $1`, [a])).toHaveLength(0);
    // …and is not told about the block
    expect(await db.as(b, `select 1 from public.user_blocks`)).toHaveLength(0);
    // the blocker still sees the name, so they can unblock later
    expect(await db.as(a, `select 1 from public.profiles where id = $1`, [b])).toHaveLength(1);
  });

  it("wins over group sharing and over the mutual list", async () => {
    const [owner, a, b] = await db.createUsers("Owner", "A", "B");
    await db.connect(owner, a);
    await db.connect(owner, b);
    const group = await db.createGroup(owner, "Crew", [a, b]);
    await db.as(a, `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]);

    const block = await db.createBlock(a, { audience: "custom" });
    await db.as(a, `insert into public.block_group_shares (block_id, group_id) values ($1, $2)`, [block, group]);

    expect(await db.canSee(b, block)).toBe(false);
    expect(await db.canSee(owner, block)).toBe(true);
    expect(await db.areConnected(a, b)).toBe(false);
    expect(await mutualIds(a)).toEqual([]);
    expect(await mutualIds(b)).toEqual([]);
    expect(await db.asError(b, `select public.connect_with($1)`, [a])).toMatch(/share a group/);
  });

  it("prevents sharing with, or re-connecting to, the blocked person", async () => {
    const [a, b] = await db.createUsers("A", "B");
    await db.connect(a, b);
    await db.as(a, `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]);

    const block = await db.createBlock(b, { audience: "custom" });
    expect(await db.asError(b, `insert into public.block_user_shares (block_id, user_id) values ($1, $2)`, [block, a])).toMatch(/row-level security/);
    await db.connect(a, b);
    expect(await db.areConnected(a, b)).toBe(false);
  });

  it("can be undone by the blocker only, and unblocking does not restore the connection", async () => {
    const [a, b] = await db.createUsers("A", "B");
    await db.connect(a, b);
    await db.as(a, `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [a, b]);

    await db.as(b, `delete from public.user_blocks`);
    expect(await db.admin(`select 1 from public.user_blocks where blocker_id = $1`, [a])).toHaveLength(1);

    await db.as(a, `delete from public.user_blocks where blocked_id = $1`, [b]);
    expect(await db.admin(`select 1 from public.user_blocks where blocker_id = $1`, [a])).toHaveLength(0);
    expect(await db.areConnected(a, b)).toBe(false);
  });

  it("cannot be forged on someone else's behalf", async () => {
    const [a, b] = await db.createUsers("A", "B");
    const error = await db.asError(a, `insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)`, [b, a]);
    expect(error).toMatch(/row-level security/);
  });
});
