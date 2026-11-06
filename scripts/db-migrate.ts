/** pnpm db:migrate — aplica las migraciones de drizzle/ en Neon (DATABASE_URL) o en PGlite local. */
import path from "node:path";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (url) {
    const { Pool } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-serverless");
    const { migrate } = await import("drizzle-orm/neon-serverless/migrator");
    const pool = new Pool({ connectionString: url });
    await migrate(drizzle({ client: pool }), { migrationsFolder });
    await pool.end();
    console.log("Migraciones aplicadas en Neon.");
  } else {
    const { getDb } = await import("../lib/db/client");
    await getDb(); // PGlite migra al abrir
    console.log("Migraciones aplicadas en PGlite (.pglite/).");
  }
}

main().catch((e) => {
  console.error("Error al migrar:", e instanceof Error ? e.message : e);
  process.exit(1);
});
