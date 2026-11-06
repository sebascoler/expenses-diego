/** pnpm db:reset — borra TODOS los datos (incluido el usuario). Pide escribir el nombre de la base para confirmar. */
import { wipeAllData } from "../lib/data-admin";
import { getDb } from "../lib/db/client";
import { arg, ask } from "./_cli";

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  const dbName = url ? new URL(url).pathname.replace(/^\//, "") || "neondb" : "pglite";
  console.log(`Vas a borrar todos los datos de la base "${dbName}"${url ? ` en ${new URL(url).host}` : " (local)"}.`);
  const confirm = arg("confirm") ?? (await ask(`Escribí el nombre de la base (${dbName}) para confirmar: `));
  if (confirm !== dbName) throw new Error("Confirmación incorrecta. No se borró nada.");
  await wipeAllData(await getDb());
  console.log("Listo: la base quedó vacía, con categorías y ajustes por defecto.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
