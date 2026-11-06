import Link from "next/link";
import { desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getDb } from "@/lib/db/client";
import { reports } from "@/lib/db/schema";
import { formatDate, formatMoney } from "@/lib/format";

export default async function ReportsPage() {
  const db = await getDb();
  const list = await db.select().from(reports).orderBy(desc(reports.createdAt));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Rendiciones</h1>
        <Link href="/rendiciones/nueva" className={buttonVariants()}>
          Nueva rendición
        </Link>
      </div>
      <Card>
        {list.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay rendiciones.</p> : null}
        <ul className="divide-y divide-border">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/rendiciones/${r.id}`} className="flex min-h-12 items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-medium">
                    {formatDate(r.dateFrom)} – {formatDate(r.dateTo)}
                  </span>
                  <span className="block text-xs text-muted-foreground">Creada el {formatDate(r.createdAt.toISOString().slice(0, 10))}</span>
                </span>
                <span className="flex items-center gap-2">
                  {r.totalEur ? <span className="font-semibold">{formatMoney(r.totalEur)}</span> : null}
                  <Badge tone={r.status === "cerrado" ? "success" : "warning"}>{r.status === "cerrado" ? "Cerrada" : "Borrador"}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
