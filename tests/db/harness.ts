/**
 * Database test harness.
 *
 * Spins up an in-memory Postgres (PGlite, no install or Docker needed), applies
 * a small Supabase stand-in plus the real migrations from `supabase/migrations`,
 * and lets a test act as a specific signed-in user so that row-level security
 * is exercised exactly as it is in production.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

export type Row = Record<string, unknown>;

export class TestDb {
  private constructor(readonly pg: PGlite) {}

  static async create(): Promise<TestDb> {
    const pg = new PGlite();
    await pg.exec(readFileSync(join(__dirname, "supabase-shim.sql"), "utf8"));
    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
      try {
        await pg.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      } catch (error) {
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
    return new TestDb(pg);
  }

  async close() {
    await this.pg.close();
  }

  /** Run SQL as the database owner (bypasses row-level security). */
  async admin<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pg.query<T>(sql, params);
    return result.rows;
  }

  /** Create a signed-up user; the profile row is created by the signup trigger. */
  async createUser(name: string): Promise<string> {
    const [row] = await this.admin<{ id: string }>(
      `insert into auth.users (raw_user_meta_data) values (jsonb_build_object('name', $1::text)) returning id`,
      [name],
    );
    return row.id;
  }

  /** Create several users at once, returned in the same order as the names. */
  async createUsers(...names: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) ids.push(await this.createUser(name));
    return ids;
  }

  /**
   * Run SQL the way a signed-in user's request does: as the `authenticated`
   * role with their id in the JWT claims. Pass `null` for a signed-out visitor.
   */
  async as<T extends Row = Row>(userId: string | null, sql: string, params: unknown[] = []): Promise<T[]> {
    const role = userId ? "authenticated" : "anon";
    const claims = userId ? JSON.stringify({ sub: userId, role }) : "";
    await this.pg.exec(`select set_config('request.jwt.claims', '${claims}', false); set role ${role};`);
    try {
      const result = await this.pg.query<T>(sql, params);
      return result.rows;
    } finally {
      await this.pg.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
    }
  }

  /** Like `as`, but resolves to the error message when the statement fails. */
  async asError(userId: string | null, sql: string, params: unknown[] = []): Promise<string | null> {
    try {
      await this.as(userId, sql, params);
      return null;
    } catch (error) {
      return (error as Error).message;
    }
  }

  // --- small fixtures used across test files --------------------------------

  /** Connect two users directly (what the trusted functions do internally). */
  async connect(a: string, b: string) {
    await this.admin(`select private.connect($1, $2)`, [a, b]);
  }

  /** Insert a block as its owner and return its id. */
  async createBlock(
    owner: string,
    fields: Partial<{
      type: "free" | "join";
      audience: "all_connections" | "custom";
      start_at: string;
      end_at: string;
      emoji: string | null;
      title: string | null;
      rsvp_enabled: boolean;
      repeat_weekly: boolean;
    }> = {},
  ): Promise<string> {
    const type = fields.type ?? "free";
    const [row] = await this.as<{ id: string }>(
      owner,
      `insert into public.blocks (type, audience, start_at, end_at, emoji, title, rsvp_enabled, repeat_weekly, tz)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'America/New_York') returning id`,
      [
        type,
        fields.audience ?? "all_connections",
        fields.start_at ?? "2026-11-20T23:00:00Z",
        fields.end_at ?? "2026-11-21T01:00:00Z",
        fields.emoji === undefined ? (type === "join" ? "🍕" : null) : fields.emoji,
        fields.title ?? null,
        fields.rsvp_enabled ?? true,
        fields.repeat_weekly ?? false,
      ],
    );
    return row.id;
  }

  /** Ids of the blocks a user can read, i.e. what RLS lets through. */
  async visibleBlockIds(viewer: string): Promise<string[]> {
    const rows = await this.as<{ id: string }>(viewer, `select id from public.blocks order by id`);
    return rows.map((r) => r.id);
  }

  async canSee(viewer: string, blockId: string): Promise<boolean> {
    return (await this.visibleBlockIds(viewer)).includes(blockId);
  }

  async createGroup(owner: string, name: string, members: string[] = []): Promise<string> {
    const [row] = await this.as<{ id: string }>(
      owner,
      `insert into public.groups (name) values ($1) returning id`,
      [name],
    );
    for (const member of members) {
      await this.as(owner, `insert into public.group_members (group_id, user_id) values ($1, $2)`, [row.id, member]);
    }
    return row.id;
  }

  async areConnected(a: string, b: string): Promise<boolean> {
    const [row] = await this.admin<{ ok: boolean }>(`select private.are_connected($1, $2) as ok`, [a, b]);
    return row.ok;
  }

  async notifications(user: string): Promise<Row[]> {
    return this.as(user, `select type, actor_id, block_id, group_id, data, read_at from public.notifications order by created_at`);
  }
}
