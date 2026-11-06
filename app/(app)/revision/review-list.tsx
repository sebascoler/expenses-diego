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
          <label className="flex min-h-11 items-center gap-2 px-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={selected.size > 0 && selected.size === editable.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(editable.map((r) => r.id)) : new Set())}
            />
            Seleccionar todas
          </label>
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
      className={cn("rounded-lg border bg-card p-3 shadow-sm", selected ? "border-primary" : "border-border")}
    >
      {/* Encabezado: el comercio siempre se lee completo (se parte en varias líneas si hace falta). */}
      <div className="flex items-start gap-3">
        <input type="checkbox" aria-label={`Seleccionar ${row.merchant}`} className="mt-0.5 h-5 w-5 shrink-0" disabled={locked} checked={selected} onChange={onSelect} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground">{formatDate(row.date)}</div>
          <div className="font-medium break-words">{row.merchant}</div>
          {row.description && row.description.toUpperCase() !== row.merchant ? <div className="text-xs break-words text-muted-foreground">{row.description}</div> : null}
          <div className="mt-1 flex flex-wrap items-center gap-1">
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
        <div className="shrink-0 text-right">
          <div className="font-semibold whitespace-nowrap">{formatMoney(row.amount, row.currency)}</div>
          {row.currency !== "EUR" || row.amountEur !== null ? <div className="text-sm whitespace-nowrap text-muted-foreground">{row.amountEur ? formatMoney(row.amountEur) : "—"}</div> : null}
        </div>
      </div>

      {/* Controles: en móvil uno debajo del otro; en pantallas anchas, en tres columnas. */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {appliesButtons}
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
        <Select aria-label={`Categoría de ${row.merchant}`} disabled={locked} value={row.categoryId ?? ""} onChange={(e) => onUpdate(row, "category", e.target.value || null, { categoryId: e.target.value || null })} className="min-h-11 text-sm">
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
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
      </div>
      {row.possibleMatch ? (
        <div className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
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
