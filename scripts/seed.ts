/**
 * Demo data: a handful of people, their connections, two groups and a couple
 * of weeks of blocks, so the app can be explored straight away.
 *
 *   npm run seed                      create/refresh the demo data
 *   npm run seed -- --me 2025551234   also connect YOUR phone number to the demo friends
 *   npm run seed -- --clear           remove the demo users and everything they own
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (read from .env.local
 * if present). Safe to run repeatedly: demo users are matched by phone number
 * and their data is rebuilt each time.
 *
 * With dev login switched on, sign in as any demo person using their phone
 * number below and the dev code. Start with Alex: (202) 555-0100.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeUsPhone } from "../src/lib/phone";
import { addDays, startOfWeek, todayKey, zonedToUtc } from "../src/lib/time";

try {
  process.loadEnvFile(".env.local");
} catch {
  // No .env.local: rely on variables already in the environment.
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
/** Demo times are written as local times in this zone. */
const ZONE = process.env.SEED_TZ || "America/New_York";

if (!SUPABASE_URL || !SECRET_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY. Add them to .env.local (see README).");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// 555-01xx numbers are reserved for fiction: they can never belong to a real person.
const PEOPLE = {
  alex: { name: "Alex Morgan", phone: "+12025550100" },
  mika: { name: "Mika Chen", phone: "+12025550101" },
  jo: { name: "Jo Lee", phone: "+12025550102" },
  sam: { name: "Sam Rivera", phone: "+12025550103" },
  priya: { name: "Priya Patel", phone: "+12025550104" },
  devon: { name: "Devon Brooks", phone: "+12025550105" },
  riley: { name: "Riley Kim", phone: "+12025550106" },
} as const;
type Who = keyof typeof PEOPLE;

function fail(step: string, error: { message: string } | null): void {
  if (error) {
    console.error(`✗ ${step}: ${error.message}`);
    process.exit(1);
  }
}

async function findUserIdByPhone(client: SupabaseClient, phone: string): Promise<string | null> {
  const digits = phone.replace(/\D/g, "");
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    fail("list users", error);
    const match = data.users.find((u) => u.phone === digits);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

/** Find or create an account for a phone number; returns the user id. */
async function ensureUser(phone: string, name: string | null): Promise<string> {
  let id = await findUserIdByPhone(db, phone);
  if (!id) {
    const { data, error } = await db.auth.admin.createUser({
      phone,
      phone_confirm: true,
      // Same placeholder address dev login uses, so both find the same account.
      email: `${phone.replace(/\D/g, "")}@dev-login.dropby.invalid`,
      email_confirm: true,
      user_metadata: name ? { name } : {},
    });
    fail(`create user ${phone}`, error);
    id = data.user!.id;
  }
  if (name) {
    const { error } = await db.from("profiles").update({ name }).eq("id", id);
    fail(`name ${name}`, error);
  }
  return id;
}

async function clearOwnedData(userIds: string[]) {
  // Deleting blocks and groups cascades to shares, RSVPs, chat and notifications.
  fail("clear blocks", (await db.from("blocks").delete().in("owner_id", userIds)).error);
  fail("clear groups", (await db.from("groups").delete().in("owner_id", userIds)).error);
  fail("clear connections a", (await db.from("connections").delete().in("user_a", userIds)).error);
  fail("clear connections b", (await db.from("connections").delete().in("user_b", userIds)).error);
  fail("clear blocks of people", (await db.from("user_blocks").delete().in("blocker_id", userIds)).error);
  fail("clear notifications", (await db.from("notifications").delete().in("user_id", userIds)).error);
}

async function main() {
  const args = process.argv.slice(2);
  const clear = args.includes("--clear");
  const meArg = args.includes("--me") ? args[args.indexOf("--me") + 1] : null;
  const mePhone = meArg ? normalizeUsPhone(meArg) : null;
  if (meArg && !mePhone) {
    console.error(`"${meArg}" is not a valid US phone number.`);
    process.exit(1);
  }

  console.log(`Seeding ${SUPABASE_URL} (demo times in ${ZONE})`);

  const id = {} as Record<Who, string>;
  for (const [key, person] of Object.entries(PEOPLE) as [Who, (typeof PEOPLE)[Who]][]) {
    id[key] = await ensureUser(person.phone, person.name);
  }
  const demoIds = Object.values(id);
  await clearOwnedData(demoIds);

  if (clear) {
    for (const userId of demoIds) fail("delete user", (await db.auth.admin.deleteUser(userId)).error);
    console.log("✓ Demo users and their data removed.");
    return;
  }

  // --- connections ---------------------------------------------------------
  const connect = async (a: string, b: string) => {
    const [user_a, user_b] = [a, b].sort();
    fail("connect", (await db.from("connections").upsert({ user_a, user_b })).error);
  };
  const pairs: [Who, Who][] = [
    ["alex", "mika"], ["alex", "jo"], ["alex", "sam"], ["alex", "priya"],
    ["mika", "jo"], ["mika", "devon"], ["mika", "riley"],
  ];
  for (const [a, b] of pairs) await connect(id[a], id[b]);

  // --- groups --------------------------------------------------------------
  const group = async (owner: Who, name: string, members: Who[]) => {
    const { data, error } = await db.from("groups").insert({ owner_id: id[owner], name }).select("id").single();
    fail(`group ${name}`, error);
    const rows = members.map((m) => ({ group_id: data!.id, user_id: id[m] }));
    fail(`members of ${name}`, (await db.from("group_members").insert(rows)).error);
    return data!.id as string;
  };
  // Devon is in Mika's group with Alex but not connected to Alex: a "mutual".
  const climbing = await group("mika", "Climbing crew", ["alex", "jo", "devon"]);
  const brunch = await group("alex", "Sunday brunch", ["mika", "sam", "priya"]);

  // --- blocks --------------------------------------------------------------
  const monday = startOfWeek(todayKey(ZONE));
  const day = (offset: number) => addDays(monday, offset); // 0 = this Monday
  const at = (dayOffset: number, hour: number) => zonedToUtc(day(dayOffset), Math.round(hour * 60), ZONE);

  interface Spec {
    owner: Who;
    type: "free" | "join";
    day: number;
    from: number;
    to: number;
    weekly?: boolean;
    title?: string;
    emoji?: string;
    location?: string;
    description?: string;
    /** Default: all connections. */
    users?: Who[];
    groups?: string[];
  }

  const block = async (spec: Spec): Promise<string> => {
    const custom = Boolean(spec.users || spec.groups);
    const { data, error } = await db
      .from("blocks")
      .insert({
        owner_id: id[spec.owner],
        type: spec.type,
        start_at: at(spec.day, spec.from),
        end_at: at(spec.day, spec.to),
        tz: ZONE,
        repeat_weekly: spec.weekly ?? false,
        title: spec.title ?? null,
        emoji: spec.emoji ?? null,
        location: spec.location ?? null,
        description: spec.description ?? null,
        audience: custom ? "custom" : "all_connections",
      })
      .select("id")
      .single();
    fail(`block ${spec.title ?? spec.type}`, error);
    const blockId = data!.id as string;
    if (spec.users?.length) {
      const rows = spec.users.map((u) => ({ block_id: blockId, user_id: id[u] }));
      fail("share with people", (await db.from("block_user_shares").insert(rows)).error);
    }
    if (spec.groups?.length) {
      const rows = spec.groups.map((group_id) => ({ block_id: blockId, group_id }));
      fail("share with group", (await db.from("block_group_shares").insert(rows)).error);
    }
    return blockId;
  };

  const rsvp = async (blockId: string, who: Who, status: "in" | "out", occurrence = 0) =>
    fail("rsvp", (await db.from("rsvps").insert({ block_id: blockId, user_id: id[who], status, occurrence })).error);

  const say = async (blockId: string, who: Who, body: string) =>
    fail("message", (await db.from("messages").insert({ block_id: blockId, user_id: id[who], body })).error);

  // Alex: free on weekday evenings (weekly) and most of the weekend.
  for (const d of [0, 1, 2, 3, 4]) await block({ owner: "alex", type: "free", day: d, from: 17, to: 22, weekly: true });
  await block({ owner: "alex", type: "free", day: 5, from: 9, to: 21, title: "Around all day" });
  await block({ owner: "alex", type: "free", day: 6, from: 10, to: 18 });

  const pizza = await block({
    owner: "alex", type: "join", day: 2, from: 19, to: 21.5,
    emoji: "🍕", title: "Pizza night", location: "Alex's place, 12 Elm St",
    description: "Making dough from scratch. Bring a topping and something to drink!",
  });
  await rsvp(pizza, "jo", "in");
  await rsvp(pizza, "sam", "out");
  await say(pizza, "jo", "I'm in! I'll bring mushrooms 🍄");
  await say(pizza, "alex", "Perfect. Doors open at 7.");
  await say(pizza, "sam", "Gutted, working late. Save me a slice?");

  const coffee = await block({
    owner: "alex", type: "join", day: 5, from: 10, to: 12,
    emoji: "☕", title: "Coffee at mine", location: "Alex's place", groups: [brunch],
  });
  await rsvp(coffee, "mika", "in");

  // Mika
  for (const d of [0, 1, 2, 4]) await block({ owner: "mika", type: "free", day: d, from: 18, to: 21, weekly: true });
  await block({ owner: "mika", type: "free", day: 5, from: 10, to: 14 });
  await block({ owner: "mika", type: "free", day: 6, from: 12, to: 17 });
  const climbingNight = await block({
    owner: "mika", type: "join", day: 3, from: 18.5, to: 20.5, weekly: true,
    emoji: "🧗", title: "Climbing", location: "Boulder Barn", description: "Usual spot. Beginners welcome, I have a spare pair of shoes.",
    groups: [climbing],
  });
  await rsvp(climbingNight, "alex", "in");
  await rsvp(climbingNight, "jo", "in");
  await say(climbingNight, "mika", "Who's driving this week?");
  await say(climbingNight, "jo", "I can take two.");

  // Jo
  for (const d of [1, 2, 4]) await block({ owner: "jo", type: "free", day: d, from: 17.5, to: 20 });
  await block({ owner: "jo", type: "free", day: 5, from: 9, to: 12 });
  await block({
    owner: "jo", type: "join", day: 4, from: 19, to: 22,
    emoji: "🎲", title: "Board games", location: "Jo's flat", description: "Catan, Wingspan, or whatever you bring.",
  });

  // Sam
  await block({ owner: "sam", type: "free", day: 2, from: 18, to: 22 });
  await block({ owner: "sam", type: "free", day: 5, from: 12, to: 18 });
  await block({ owner: "sam", type: "free", day: 6, from: 10, to: 16, title: "Park?" });

  // Priya
  for (const d of [0, 3]) await block({ owner: "priya", type: "free", day: d, from: 19, to: 21, weekly: true });
  await block({
    owner: "priya", type: "join", day: 13, from: 11, to: 13,
    emoji: "🥞", title: "Pancake brunch", location: "Priya's", description: "Stack 'em high.",
  });

  // Devon and Riley: not connected to Alex, so Alex must NOT see these.
  await block({ owner: "devon", type: "free", day: 3, from: 17, to: 21 });
  await block({ owner: "riley", type: "free", day: 1, from: 12, to: 14 });

  // --- optionally hook up a real phone number --------------------------------
  if (mePhone) {
    const me = await ensureUser(mePhone, null);
    for (const friend of ["alex", "mika", "jo", "sam", "priya"] as Who[]) await connect(me, id[friend]);
    fail("add to brunch", (await db.from("group_members").upsert({ group_id: brunch, user_id: me })).error);
    fail("add to climbing", (await db.from("group_members").upsert({ group_id: climbing, user_id: me })).error);
    console.log(`✓ ${mePhone} is connected to Alex, Mika, Jo, Sam and Priya, and is in both groups.`);
  }

  console.log("✓ Demo data ready.\n");
  console.log("Demo people (sign in with the dev code while dev login is on):");
  for (const person of Object.values(PEOPLE)) console.log(`  ${person.name.padEnd(14)} ${person.phone}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
