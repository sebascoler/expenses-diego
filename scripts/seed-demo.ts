/** pnpm db:seed:demo — carga los fixtures sintéticos y 2 viajes de ejemplo (§16.6). Solo datos ficticios. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { reassignTrips } from "../lib/classify/pipeline";
import { getDb } from "../lib/db/client";
import { trips } from "../lib/db/schema";
import { importFile } from "../lib/import/pipeline";

async function main() {
  const db = await getDb();
  await db.insert(trips).values([
    { name: "Lima – Proveedores", destination: "Lima, Perú", dateFrom: "2026-09-10", dateTo: "2026-09-18" },
    { name: "España – Feria", destination: "Madrid y Barcelona", dateFrom: "2026-10-03", dateTo: "2026-10-12" },
  ]);
  for (const f of ["wise-sample.csv", "bbva-sample.xlsx", "bbva-overlap.xlsx"]) {
    const out = await importFile(db, { buffer: readFileSync(path.join(process.cwd(), "fixtures", f)), fileName: f });
    if (out.status === "done") {
      const s = out.summary;
      console.log(`${f}: ${s.rowsRead} leídos, ${s.rowsNew} nuevos, ${s.rowsDup} duplicados, ${s.rowsIgnored} no-gastos, ${s.rowsReconciled} reconciliados`);
    } else console.log(`${f}: ${out.status}`);
  }
  await reassignTrips(db);
  console.log("Demo cargada.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
