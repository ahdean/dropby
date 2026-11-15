/**
 * Saved places: a private list of nicknamed addresses, per person.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TestDb } from "./harness";

let db: TestDb;
let alex: string, mika: string;

beforeAll(async () => {
  db = await TestDb.create();
  [alex, mika] = await db.createUsers("Alex", "Mika");
  await db.connect(alex, mika); // even a connection must not see the list
});

afterAll(async () => {
  await db.close();
});

const add = (owner: string, name: string, address: string) =>
  db.as<{ id: string }>(owner, `insert into public.saved_places (name, address) values ($1, $2) returning id`, [name, address]);

const names = async (viewer: string) =>
  (await db.as<{ name: string }>(viewer, `select name from public.saved_places order by name`)).map((r) => r.name);

describe("saved places", () => {
  it("can be added, renamed, re-addressed and deleted by their owner", async () => {
    const [place] = await add(alex, "Home", "12 Elm St");
    await add(alex, "Climbing gym", "Boulder Barn, 5 Rock Rd");
    expect(await names(alex)).toEqual(["Climbing gym", "Home"]);

    await db.as(alex, `update public.saved_places set name = 'My place', address = '12 Elm St, Apt 4' where id = $1`, [place.id]);
    const [row] = await db.as<{ name: string; address: string }>(alex, `select name, address from public.saved_places where id = $1`, [place.id]);
    expect(row).toEqual({ name: "My place", address: "12 Elm St, Apt 4" });

    await db.as(alex, `delete from public.saved_places where id = $1`, [place.id]);
    expect(await names(alex)).toEqual(["Climbing gym"]);
  });

  it("are invisible to everyone else, connections included", async () => {
    await add(alex, "Secret spot", "Behind the old mill");
    expect(await names(mika)).toEqual([]);
    expect(await db.asError(null, `select * from public.saved_places`)).toMatch(/permission denied/);
  });

  it("cannot be changed or removed by anyone else", async () => {
    const [place] = await add(alex, "Office", "1 Work Way");
    await db.as(mika, `update public.saved_places set address = 'hijacked' where id = $1`, [place.id]);
    await db.as(mika, `delete from public.saved_places where id = $1`, [place.id]);
    const [row] = await db.admin<{ address: string }>(`select address from public.saved_places where id = $1`, [place.id]);
    expect(row.address).toBe("1 Work Way");
  });

  it("cannot be created in someone else's list, or handed to someone else", async () => {
    const forged = await db.asError(mika, `insert into public.saved_places (owner_id, name, address) values ($1, 'Planted', 'x')`, [alex]);
    expect(forged).toMatch(/row-level security/);
    const [place] = await add(mika, "Mika's flat", "9 Oak Ave");
    expect(await db.asError(mika, `update public.saved_places set owner_id = $2 where id = $1`, [place.id, alex])).toMatch(/permission denied/);
  });

  it("need a nickname and an address, and each nickname is used once per person", async () => {
    expect(await db.asError(alex, `insert into public.saved_places (name, address) values ('  ', '1 Some St')`)).toMatch(/saved_places_name_check/);
    expect(await db.asError(alex, `insert into public.saved_places (name, address) values ('Park', '')`)).toMatch(/saved_places_address_check/);

    await add(alex, "Park", "Riverside Park");
    expect(await db.asError(alex, `insert into public.saved_places (name, address) values (' park ', 'Another park')`)).toMatch(
      /saved_places_owner_name_uniq/,
    );
    // …but two people can each have a "Park".
    await add(mika, "Park", "Hill Park");
  });

  it("are capped at 50 per person", async () => {
    const [hoarder] = await db.createUsers("Hoarder");
    for (let i = 0; i < 50; i++) await add(hoarder, `Place ${i}`, `${i} Main St`);
    expect(await db.asError(hoarder, `insert into public.saved_places (name, address) values ('One more', 'x')`)).toMatch(/up to 50 places/);
  });
});
