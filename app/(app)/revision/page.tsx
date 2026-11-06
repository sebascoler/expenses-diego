import { getDb } from "@/lib/db/client";
import { isAiEnabled } from "@/lib/classify/ai";
import { counters } from "@/lib/queries";
import { FILTERS, loadReview, type Filter } from "@/lib/review-data";
import { ReviewList } from "./review-list";
import { FilterBar } from "./filter-bar";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const filter: Filter = FILTERS.includes(sp.f as Filter) ? (sp.f as Filter) : "revisar";
  const db = await getDb();
  const [data, c] = await Promise.all([loadReview(db, filter, { tripId: sp.trip, source: sp.source }), counters(db)]);
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Revisión de gastos</h1>
      <FilterBar filter={filter} trips={data.trips} tripId={sp.trip} source={sp.source} />
      <ReviewList
        key={`${filter}-${sp.trip ?? ""}-${sp.source ?? ""}`}
        filter={filter}
        rows={data.rows}
        trips={data.trips}
        categories={data.categories}
        aiEnabled={isAiEnabled()}
        initialCounters={{ review: c.review, empresa: c.empresa, personal: c.personal, pendingBbva: c.pendingBbva, totalEmpresa: c.totalEmpresa.toFixed(2) }}
      />
    </div>
  );
}
