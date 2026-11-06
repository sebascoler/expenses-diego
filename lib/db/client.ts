import "server-only";
import path from "node:path";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import { env } from "../env";
import { ensureBaseData } from "./seed-base";

export type DB = PgliteDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type DbOrTx = DB | Tx;

type Holder = { promise?: Promise<DB> };
const globalHolder = globalThis as unknown as { __expensesDb?: Holder };
const holder: Holder = process.env.VITEST ? {} : (globalHolder.__expensesDb ??= {});

export const migrationsFolder = path.join(process.cwd(), "drizzle");

async function createDb(): Promise<DB> {
  const url = env.databaseUrl;
  if (url) {
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const pool = new Pool({ connectionString: url });
    // Misma API de consultas que PGlite (ambos son PgDatabase de Drizzle).
    const neonDb = drizzle({ client: pool, schema }) as unknown as DB;
    await ensureBaseData(neonDb);
    return neonDb;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.VITEST ? undefined : process.env.PGLITE_DIR || path.join(process.cwd(), ".pglite");
  const client = dataDir ? new PGlite(dataDir) : new PGlite();
  const db = drizzlePglite({ client, schema });
  await migratePglite(db, { migrationsFolder });
  await ensureBaseData(db);
  return db;
}

export function getDb(): Promise<DB> {
  holder.promise ??= createDb().catch((err) => {
    holder.promise = undefined;
    throw err;
  });
  return holder.promise;
}

/** Solo para tests: base PGlite nueva en memoria. */
export function resetDbForTests() {
  holder.promise = undefined;
}

export { schema };
