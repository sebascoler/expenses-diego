"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FileUp, Loader2, CheckCircle2, AlertTriangle, Copy } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n/es";
import type { ImportOutcome } from "@/lib/import/pipeline";
import type { ColumnMapping } from "@/lib/parsers/types";

type Item = { id: number; file: File; state: "uploading" | "result"; outcome?: ImportOutcome };

const FIELDS: { key: keyof ColumnMapping; label: string; required?: boolean }[] = [
  { key: "date", label: "Fecha", required: true },
  { key: "description", label: "Descripción / comercio", required: true },
  { key: "amount", label: "Monto (una sola columna)" },
  { key: "debit", label: "Débito (si va separado)" },
  { key: "credit", label: "Crédito (si va separado)" },
  { key: "currency", label: "Moneda" },
  { key: "card", label: "Tarjeta" },
  { key: "status", label: "Estado (pendiente / consolidado)" },
  { key: "fee", label: "Fee / comisión" },
  { key: "externalId", label: "ID del movimiento" },
];

async function upload(file: File, mapping?: ColumnMapping): Promise<ImportOutcome> {
  const fd = new FormData();
  fd.append("file", file);
  if (mapping) fd.append("mapping", JSON.stringify(mapping));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch("/api/import", { method: "POST", body: fd });
      if (res.status === 401) {
        window.location.assign(new URL("/login", window.location.origin));
        throw new Error("sesión");
      }
      return (await res.json()) as ImportOutcome;
    } catch (err) {
      if (attempt === 2) return { status: "invalid", fileName: file.name, message: "No se pudo subir (¿sin conexión?). Probá de nuevo." };
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      void err;
    }
  }
  return { status: "invalid", fileName: file.name, message: "No se pudo subir." };
}

export function Importer() {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const added = list.map((file) => ({ id: nextId.current++, file, state: "uploading" as const }));
    setItems((prev) => [...added, ...prev]);
    // Un archivo por vez: respeta el límite de tamaño por request y es más amable con conexiones lentas.
    for (const it of added) {
      const outcome = await upload(it.file);
      setItems((prev) => prev.map((p) => (p.id === it.id ? { ...p, state: "result", outcome } : p)));
    }
  }

  async function submitMapping(id: number, mapping: ColumnMapping) {
    const it = items.find((i) => i.id === id);
    if (!it) return;
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, state: "uploading" } : p)));
    const outcome = await upload(it.file, mapping);
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, state: "result", outcome } : p)));
  }

  const anyDone = items.some((i) => i.outcome?.status === "done");

  return (
    <div className="space-y-4">
      <label
        htmlFor="file-input"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
        }}
        className={`flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center ${dragging ? "border-primary bg-teal-50" : "border-border bg-card"}`}
      >
        <FileUp className="h-8 w-8 text-primary" aria-hidden />
        <span className="font-medium">{t.import.drop}</span>
        <span className="text-xs text-muted-foreground">{t.import.accepts}</span>
        <input
          ref={inputRef}
          id="file-input"
          data-testid="file-input"
          type="file"
          multiple
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {items.map((it) => (
        <ResultCard key={it.id} item={it} onMapping={(m) => submitMapping(it.id, m)} />
      ))}

      {anyDone ? (
        <Link href="/revision" className={buttonVariants({ size: "lg", className: "w-full" })}>
          {t.import.goReview}
        </Link>
      ) : null}
    </div>
  );
}

function ResultCard({ item, onMapping }: { item: Item; onMapping: (m: ColumnMapping) => void }) {
  if (item.state === "uploading")
    return (
      <Card className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Procesando {item.file.name}…
      </Card>
    );
  const o = item.outcome!;
  if (o.status === "duplicate_file")
    return (
      <Card className="flex items-start gap-2 text-sm" data-testid="import-result">
        <Copy className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
        <div>
          <div className="font-medium">{o.fileName}</div>
          {t.import.already} {formatDate(o.importedAt.slice(0, 10))}. No se volvió a procesar.
        </div>
      </Card>
    );
  if (o.status === "invalid")
    return (
      <Card className="flex items-start gap-2 text-sm" data-testid="import-result">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
        <div>
          <div className="font-medium">{o.fileName}</div>
          <div className="text-danger">{o.message}</div>
        </div>
      </Card>
    );
  if (o.status === "needs_mapping") return <MappingForm outcome={o} onSubmit={onMapping} />;
  const s = o.summary;
  return (
    <Card className="space-y-2 text-sm" data-testid="import-result">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
        <div>
          <div className="font-medium">
            {s.fileName} · {s.source === "wise" ? "Wise" : "BBVA"}
            {s.dateFrom ? ` · ${formatDate(s.dateFrom)} al ${formatDate(s.dateTo)}` : ""}
          </div>
          <p data-testid="import-summary">
            Se leyeron {s.rowsRead} movimientos: {s.rowsNew} nuevos, {s.rowsDup} duplicados ignorados, {s.rowsIgnored} no son gastos (transferencias o conversiones)
            {s.rowsReconciled ? `, ${s.rowsReconciled} pendientes de BBVA actualizados a consolidado` : ""}.
          </p>
          {s.rowsAmbiguous ? <p className="text-warning">{s.rowsAmbiguous} posibles coincidencias con pendientes: confirmalas en la revisión.</p> : null}
          {s.usedProfile ? <p className="text-muted-foreground">Se usó el mapeo de columnas guardado.</p> : null}
        </div>
      </div>
      {s.errors.length ? (
        <details className="rounded-lg bg-amber-50 p-2 text-amber-900">
          <summary>{s.errors.length} filas no se pudieron leer</summary>
          <ul className="mt-1 list-disc pl-5">
            {s.errors.slice(0, 50).map((e) => (
              <li key={e.rowNumber}>
                Fila {e.rowNumber}: {e.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Card>
  );
}

function MappingForm({ outcome, onSubmit }: { outcome: Extract<ImportOutcome, { status: "needs_mapping" }>; onSubmit: (m: ColumnMapping) => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [source, setSource] = useState<"bbva" | "wise">("bbva");
  const [positive, setPositive] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const m: ColumnMapping = {
      source,
      date: values.date ?? "",
      description: values.description ?? "",
      amount: values.amount || null,
      debit: values.debit || null,
      credit: values.credit || null,
      currency: values.currency || null,
      defaultCurrency: defaultCurrency ? defaultCurrency.toUpperCase() : null,
      card: values.card || null,
      status: values.status || null,
      fee: values.fee || null,
      externalId: values.externalId || null,
      expensesPositive: positive,
    };
    if (!m.date || !m.description) return setError("Elegí al menos la fecha y la descripción.");
    if (!m.amount && !m.debit && !m.credit) return setError("Elegí la columna de monto, o las de débito y crédito.");
    if (!m.currency && !m.defaultCurrency) return setError("Elegí la columna de moneda o escribí una moneda fija (ej. USD).");
    setError(null);
    onSubmit(m);
  }

  return (
    <Card className="space-y-3 text-sm" data-testid="mapping-form">
      <div>
        <div className="font-medium">
          {t.import.mappingTitle}: {outcome.fileName}
        </div>
        <p className="text-muted-foreground">
          {outcome.reason} {t.import.mappingHelp}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full text-xs">
          <thead className="bg-muted">
            <tr>
              {outcome.headers.map((h, i) => (
                <th key={i} className="whitespace-nowrap px-2 py-1 text-left">
                  {h || `(columna ${i + 1})`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outcome.sample.map((r, i) => (
              <tr key={i} className="border-t border-border">
                {r.map((c, j) => (
                  <td key={j} className="whitespace-nowrap px-2 py-1">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="map-source">¿De qué banco es?</Label>
          <Select id="map-source" value={source} onChange={(e) => setSource(e.target.value as "bbva" | "wise")}>
            <option value="bbva">BBVA</option>
            <option value="wise">Wise</option>
          </Select>
        </div>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <Label htmlFor={`map-${f.key}`}>
              {f.label}
              {f.required ? " *" : ""}
            </Label>
            <Select id={`map-${f.key}`} value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}>
              <option value="">— No está —</option>
              {outcome.headers.map((h, i) =>
                h ? (
                  <option key={i} value={h}>
                    {h}
                  </option>
                ) : null,
              )}
            </Select>
          </div>
        ))}
        <div>
          <Label htmlFor="map-default-currency">Moneda fija (si no hay columna)</Label>
          <Input id="map-default-currency" placeholder="USD" maxLength={3} value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)} />
        </div>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={positive} onChange={(e) => setPositive(e.target.checked)} />
          Los gastos figuran con signo positivo (columna única de monto)
        </label>
      </div>
      {error ? <p className="text-danger">{error}</p> : null}
      <Button onClick={submit} className="w-full">
        Importar con este mapeo
      </Button>
    </Card>
  );
}
