"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Sparkles, CreditCard, Wallet, Banknote, Loader2, Plus, CloudOff, CloudCheck } from "lucide-react";
import {
  acceptHighAction,
  addManualAction,
  bulkAction,
  reclassifyAction,
  resolveMatchAction,
  ruleOfferAction,
  updateTransactionAction,
  type Counters,
  type UpdateResult,
} from "@/app/actions/review";
import { useAutosave } from "@/components/app/use-autosave";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { formatDate, formatMoney, formatNumber, todayIso } from "@/lib/format";
import { t } from "@/lib/i18n/es";
import type { ReviewRow } from "@/lib/review-data";
import { cn } from "@/lib/utils";

type TripOpt = { id: string; name: string; isGeneral: boolean };
type CatOpt = { id: string; name: string };
type RuleOffer = { merchant: string; applies: boolean };

const CONF_TONE = { alta: "success", media: "warning", baja: "neutral" } as const;

export function ReviewList({
  filter,
  rows: initialRows,
  trips,
  categories,
  aiEnabled,
  initialCounters,
}: {
  filter: string;
  rows: ReviewRow[];
  trips: TripOpt[];
  categories: CatOpt[];
  aiEnabled: boolean;
  initialCounters: Counters;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [prevRows, setPrevRows] = useState(initialRows);
  const [prevCounters, setPrevCounters] = useState(initialCounters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [counters, setCounters] = useState(initialCounters);
  const [offers, setOffers] = useState<RuleOffer[]>([]);
  const [busy, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);
  const { status, save } = useAutosave();
  // Al refrescar desde el servidor (router.refresh) se toman los datos nuevos.
  if (prevRows !== initialRows) {
    setPrevRows(initialRows);
    setRows(initialRows);
  }
  if (prevCounters !== initialCounters) {
    setPrevCounters(initialCounters);
    setCounters(initialCounters);
  }
  const tripName = useMemo(() => new Map(trips.map((x) => [x.id, x.name])), [trips]);

  const patchRow = (id: string, patch: Partial<ReviewRow>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function handleResult(res: UpdateResult | undefined) {
    if (!res || !res.ok) return;
    setCounters(res.counters);
    if (res.offers.length) setOffers((o) => [...o, ...res.offers.filter((n) => !o.some((x) => x.merchant === n.merchant))]);
  }

  function update(row: ReviewRow, field: "applies" | "trip" | "category" | "surcharge" | "note" | "accept", value: unknown, optimistic: Partial<ReviewRow>) {
    const before = { ...row };
    patchRow(row.id, optimistic);
    void save(
      async () => {
        const res = await updateTransactionAction({ id: row.id, field, value } as Parameters<typeof updateTransactionAction>[0]);
        if (res.ok && res.amountEur !== undefined) patchRow(row.id, { amountEur: res.amountEur });
        handleResult(res);
        return res;
      },
      () => patchRow(row.id, before),
    );
  }

  function bulk(action: "applies" | "trip" | "category", value: boolean | string | null) {
    const ids = [...selected];
    if (!ids.length) return;
    const optimistic: Partial<ReviewRow> = action === "applies" ? { applies: value as boolean } : action === "trip" ? { tripId: value as string } : { categoryId: value as string };
    setRows((rs) => rs.map((r) => (selected.has(r.id) && !r.rendered ? { ...r, ...optimistic } : r)));
    void save(async () => {
      const res = await bulkAction({ ids, action, value } as Parameters<typeof bulkAction>[0]);
      handleResult(res);
      return res;
    });
    setSelected(new Set());
  }

  const toggleSel = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const editable = rows.filter((r) => !r.rendered && r.kind === "gasto");
  const highCount = editable.filter((r) => r.applies === null && r.suggestionConfidence === "alta" && r.suggestedApplies !== null).length;

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm" data-testid="counters">
        <span>
          <strong>{counters.review}</strong> por revisar · <strong>{counters.empresa}</strong> empresa · <strong>{counters.personal}</strong> personal · Total empresa:{" "}
          <strong>{formatMoney(counters.totalEmpresa)}</strong>
        </span>
        <SaveIndicator status={status} />
      </Card>

      {flash ? <p className="rounded-lg bg-teal-50 p-2 text-sm text-teal-900">{flash}</p> : null}

      {offers.map((o) => (
        <Card key={o.merchant} className="flex flex-col gap-2 border-primary p-3 text-sm sm:flex-row sm:items-center sm:justify-between" data-testid="rule-offer">
          <span>
            ¿Crear regla? Siempre marcar <strong>{o.merchant}</strong> como {o.applies ? "empresa" : "personal"}.
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={async () => {
                await ruleOfferAction({ merchant: o.merchant, applies: o.applies, create: true });
                setOffers((x) => x.filter((y) => y.merchant !== o.merchant));
                setFlash(`Regla creada para ${o.merchant}.`);
              }}
            >
              Crear regla
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await ruleOfferAction({ merchant: o.merchant, applies: o.applies, create: false });
                setOffers((x) => x.filter((y) => y.merchant !== o.merchant));
              }}
            >
              No, gracias
            </Button>
          </div>
        </Card>
      ))}

      <div className="flex flex-wrap gap-2">
        {filter === "revisar" ? (
          <Button
            variant="success"
            disabled={busy || highCount === 0}
            onClick={() =>
              startTransition(async () => {
                const r = await acceptHighAction();
                setFlash(`Se aceptaron ${r.count} sugerencias de confianza alta.`);
                router.refresh();
              })
            }
          >
            <Check className="h-4 w-4" aria-hidden /> Aceptar todas las de confianza alta ({highCount})
          </Button>
        ) : null}
        {aiEnabled && filter === "revisar" ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                const r = await reclassifyAction();
                setFlash(`Clasificación actualizada (${r.ai} sugerencias de la IA).`);
                router.refresh();
              })
            }
          >
            <Sparkles className="h-4 w-4" aria-hidden /> Volver a clasificar
          </Button>
        ) : null}
        <ManualExpenseForm trips={trips} categories={categories} onDone={() => router.refresh()} />
      </div>

      {selected.size > 0 ? (
        <Card className="sticky top-14 z-10 flex flex-wrap items-center gap-2 p-3 text-sm shadow-md" data-testid="bulk-bar">
          <span className="font-medium">{selected.size} seleccionadas</span>
          <Button size="sm" variant="success" onClick={() => bulk("applies", true)}>
            Aplica
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulk("applies", false)}>
            No aplica
          </Button>
          <Select aria-label="Asignar viaje a las seleccionadas" className="min-h-9 w-auto text-sm" value="" onChange={(e) => e.target.value && bulk("trip", e.target.value)}>
            <option value="">Asignar viaje…</option>
            {trips.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Asignar categoría a las seleccionadas" className="min-h-9 w-auto text-sm" value="" onChange={(e) => e.target.value && bulk("category", e.target.value)}>
            <option value="">Asignar categoría…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Cancelar
          </Button>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <Card className="text-center text-sm text-muted-foreground">{filter === "revisar" ? "¡No queda nada por revisar! 🎉" : "No hay movimientos con este filtro."}</Card>
      ) : (
        <>
          <div className="hidden items-center gap-2 px-3 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[24px_80px_1fr_120px_96px_150px_170px_170px]">
            <input
              type="checkbox"
              aria-label="Seleccionar todas"
              className="h-4 w-4"
              checked={selected.size > 0 && selected.size === editable.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(editable.map((r) => r.id)) : new Set())}
            />
            <span>Fecha</span>
            <span>Comercio</span>
            <span className="text-right">Monto</span>
            <span className="text-right">EUR</span>
            <span>Aplica</span>
            <span>Viaje</span>
            <span>Categoría</span>
          </div>
          <ul className="space-y-2" data-testid="review-list">
            {rows.map((r) => (
              <TxRow
                key={r.id}
                row={r}
                trips={trips}
                categories={categories}
                tripName={tripName.get(r.tripId ?? "") ?? "—"}
                selected={selected.has(r.id)}
                onSelect={() => toggleSel(r.id)}
                onUpdate={update}
                onResolved={() => router.refresh()}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function SaveIndicator({ status }: { status: string }) {
  if (status === "idle") return null;
  if (status === "saving")
    return (
      <span className="flex items-center gap-1 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {t.common.saving}
      </span>
    );
  if (status === "retrying")
    return (
      <span className="flex items-center gap-1 text-warning">
        <CloudOff className="h-4 w-4" aria-hidden /> {t.common.retrying}
      </span>
    );
  if (status === "error")
    return (
      <span className="flex items-center gap-1 text-danger">
        <CloudOff className="h-4 w-4" aria-hidden /> {t.common.error}
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-success" data-testid="saved">
      <CloudCheck className="h-4 w-4" aria-hidden /> {t.common.saved}
    </span>
  );
}

function SourceIcon({ row }: { row: ReviewRow }) {
  const label = row.source === "wise" ? "Wise" : row.source === "bbva" ? `BBVA${row.cardLast4 ? ` ····${row.cardLast4}` : ""}${row.cardType ? ` (${row.cardType === "virtual" ? "virtual" : "física"})` : ""}` : "Manual";
  const Icon = row.source === "wise" ? Wallet : row.source === "bbva" ? CreditCard : Banknote;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={label}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  );
}

function TxRow({
  row,
  trips,
  categories,
  tripName,
  selected,
  onSelect,
  onUpdate,
  onResolved,
}: {
  row: ReviewRow;
  trips: TripOpt[];
  categories: CatOpt[];
  tripName: string;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (row: ReviewRow, field: "applies" | "trip" | "category" | "surcharge" | "note" | "accept", value: unknown, optimistic: Partial<ReviewRow>) => void;
  onResolved: () => void;
}) {
  const locked = row.rendered || row.kind !== "gasto";
  const [note, setNote] = useState(row.note);
  const [showNote, setShowNote] = useState(Boolean(row.note));
  const suggestionLabel = row.suggestedApplies === null ? "sin decidir" : row.suggestedApplies ? "empresa" : "personal";

  const appliesButtons = (
    <div className="flex gap-1" role="group" aria-label={`Aplica ${row.merchant}`}>
      <button
        type="button"
        disabled={locked}
        aria-pressed={row.applies === true}
        onClick={() => onUpdate(row, "applies", row.applies === true ? null : true, { applies: row.applies === true ? null : true })}
        className={cn("flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border px-2 text-sm", row.applies === true ? "border-success bg-success text-white" : "border-border bg-card")}
      >
        <Check className="h-4 w-4" aria-hidden /> {t.common.aplica}
      </button>
      <button
        type="button"
        disabled={locked}
        aria-pressed={row.applies === false}
        onClick={() => onUpdate(row, "applies", row.applies === false ? null : false, { applies: row.applies === false ? null : false })}
        className={cn("flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg border px-2 text-sm", row.applies === false ? "border-slate-600 bg-slate-600 text-white" : "border-border bg-card")}
      >
        <X className="h-4 w-4" aria-hidden /> {t.common.noAplica}
      </button>
    </div>
  );

  return (
    <li
      data-testid="tx-row"
      data-merchant={row.merchant}
      data-applies={row.applies === null ? "null" : String(row.applies)}
      className={cn("rounded-lg border bg-card p-3 shadow-sm md:grid md:grid-cols-[24px_80px_1fr_120px_96px_150px_170px_170px] md:items-center md:gap-2 md:py-2", selected ? "border-primary" : "border-border")}
    >
      <div className="float-right md:float-none">
        <input type="checkbox" aria-label={`Seleccionar ${row.merchant}`} className="h-5 w-5 md:h-4 md:w-4" disabled={locked} checked={selected} onChange={onSelect} />
      </div>
      <div className="text-xs text-muted-foreground md:text-sm">{formatDate(row.date)}</div>
      <div className="min-w-0">
        <div className="truncate font-medium">{row.merchant}</div>
        <div className="flex flex-wrap items-center gap-1">
          <SourceIcon row={row} />
          {row.bankStatus === "pendiente" ? <Badge tone="warning">{t.common.pendiente}</Badge> : null}
          {row.rendered ? <Badge tone="info">{t.common.rendido}</Badge> : null}
          {row.kind === "no_gasto" ? <Badge>No es gasto</Badge> : null}
          {row.fxSource === "pendiente" ? <Badge tone="danger">Sin tipo de cambio</Badge> : null}
        </div>
        {row.applies === null && row.kind === "gasto" ? (
          <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
            {row.suggestionConfidence ? (
              <>
                <Badge tone={CONF_TONE[row.suggestionConfidence]}>Confianza {row.suggestionConfidence}</Badge>
                <span className="text-muted-foreground">
                  Sugerido: {suggestionLabel} · {row.suggestionReason}
                </span>
                {row.suggestedApplies !== null && !locked ? (
                  <button type="button" className="text-primary underline" onClick={() => onUpdate(row, "accept", true, { applies: row.suggestedApplies })}>
                    Aceptar
                  </button>
                ) : null}
              </>
            ) : (
              <Badge>{t.common.sinClasificar}</Badge>
            )}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex items-baseline justify-between md:mt-0 md:block md:text-right">
        <span className="font-semibold md:font-normal">{formatMoney(row.amount, row.currency)}</span>
        <span className="text-sm text-muted-foreground md:hidden">{row.amountEur ? formatMoney(row.amountEur) : "—"}</span>
      </div>
      <div className="hidden text-right text-sm md:block">{row.amountEur ? formatMoney(row.amountEur) : "—"}</div>
      <div className="mt-2 md:mt-0">{appliesButtons}</div>
      <div className="mt-2 md:mt-0">
        <Select
          aria-label={`Viaje de ${row.merchant}`}
          disabled={locked}
          value={row.tripId ?? ""}
          onChange={(e) => onUpdate(row, "trip", e.target.value || null, { tripId: e.target.value || null, tripNeedsReview: false })}
          className={cn("min-h-11 text-sm", row.tripNeedsReview && "border-warning")}
          title={row.tripNeedsReview ? "Hay viajes solapados: revisá" : tripName}
        >
          <option value="">Automático por fecha</option>
          {trips.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-2 md:mt-0">
        <Select aria-label={`Categoría de ${row.merchant}`} disabled={locked} value={row.categoryId ?? ""} onChange={(e) => onUpdate(row, "category", e.target.value || null, { categoryId: e.target.value || null })} className="min-h-11 text-sm">
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm md:col-span-8 md:col-start-3 md:mt-1">
        {row.source === "bbva" && row.kind === "gasto" ? (
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="h-5 w-5" disabled={locked} checked={row.surchargeEnabled} onChange={(e) => onUpdate(row, "surcharge", e.target.checked, { surchargeEnabled: e.target.checked })} />
            Recargo {formatNumber(row.surchargePct, 0)}%
          </label>
        ) : null}
        {!showNote && !locked ? (
          <button type="button" className="min-h-11 text-primary" onClick={() => setShowNote(true)}>
            + Nota
          </button>
        ) : null}
        {showNote ? (
          <Input
            aria-label={`Nota de ${row.merchant}`}
            disabled={locked}
            className="min-h-10 flex-1 text-sm"
            placeholder="Nota (solo la ves vos)"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== row.note && onUpdate(row, "note", note, { note })}
          />
        ) : null}
        {row.description && row.description.toUpperCase() !== row.merchant ? <span className="w-full truncate text-xs text-muted-foreground">{row.description}</span> : null}
      </div>
      {row.possibleMatch ? (
        <div className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900 md:col-span-8 md:col-start-3">
          ¿Es el mismo gasto que el pendiente del {formatDate(row.possibleMatch.date)} por {formatMoney(row.possibleMatch.amount, row.currency)}?
          <div className="mt-1 flex gap-2">
            <Button size="sm" onClick={async () => (await resolveMatchAction({ id: row.id, same: true }), onResolved())}>
              Sí, fusionar
            </Button>
            <Button size="sm" variant="outline" onClick={async () => (await resolveMatchAction({ id: row.id, same: false }), onResolved())}>
              No, es otro
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function ManualExpenseForm({ trips, categories, onDone }: { trips: TripOpt[]; categories: CatOpt[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(async (prev: { error?: string; ok?: boolean } | undefined, fd: FormData) => {
    const r = await addManualAction(prev, fd);
    if (r.ok) {
      setOpen(false);
      onDone();
    }
    return r;
  }, undefined);
  if (!open)
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> Agregar gasto manual
      </Button>
    );
  return (
    <Card className="w-full">
      <form action={action} className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="m-date">Fecha</Label>
          <Input id="m-date" name="date" type="date" defaultValue={todayIso()} required />
        </div>
        <div>
          <Label htmlFor="m-amount">Monto</Label>
          <Input id="m-amount" name="amount" inputMode="decimal" placeholder="25,50" required />
        </div>
        <div>
          <Label htmlFor="m-currency">Moneda</Label>
          <Input id="m-currency" name="currency" defaultValue="EUR" maxLength={3} required />
        </div>
        <div className="sm:col-span-3">
          <Label htmlFor="m-merchant">Comercio / concepto</Label>
          <Input id="m-merchant" name="merchant" placeholder="Taxi aeropuerto (efectivo)" required />
        </div>
        <div>
          <Label htmlFor="m-trip">Viaje</Label>
          <Select id="m-trip" name="tripId" defaultValue="">
            <option value="">Automático por fecha</option>
            {trips.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="m-cat">Categoría</Label>
          <Select id="m-cat" name="categoryId" defaultValue="">
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="m-note">Nota</Label>
          <Input id="m-note" name="note" />
        </div>
        {state?.error ? <p className="text-sm text-danger sm:col-span-3">{state.error}</p> : null}
        <div className="flex gap-2 sm:col-span-3">
          <Button type="submit" disabled={pending}>
            Guardar gasto
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
