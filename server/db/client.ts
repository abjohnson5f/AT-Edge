import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL not set — database features disabled");
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
}

export function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL;
}

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function queryOne<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, params);
  return result.rows[0] ?? null;
}

export async function queryMany<T extends pg.QueryResultRow = any>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await query<T>(text, params);
  return result.rows;
}

/** Run the migration SQL against the database */
export async function runMigration(): Promise<void> {
  const fs = await import("fs");
  const path = await import("path");
  const migrationPath = path.join(
    import.meta.dirname ?? new URL(".", import.meta.url).pathname,
    "migration.sql"
  );
  const sql = fs.readFileSync(migrationPath, "utf-8");
  await getPool().query(sql);
}
