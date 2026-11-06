"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, Mail, Lock, Unlock } from "lucide-react";
import { closeReportAction, deleteDraftAction, reopenReportAction, saveEmailAction } from "@/app/actions/reports";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useAutosave } from "@/components/app/use-autosave";
import { formatMoney } from "@/lib/format";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    },
  };
}

export function Deliverables(props: { reportId: string; total: string; invoiceLine: string; subject: string; body: string; recipient: string; closed: boolean; hasLines: boolean }) {
  const [subject, setSubject] = useState(props.subject);
  const [body, setBody] = useState(props.body);
  const { copied, copy } = useCopy();
  const { save, status } = useAutosave();
  const persist = () => void save(() => saveEmailAction({ id: props.reportId, subject, body }));
  const amount = props.total.replace(".", ",");
  const mailto = `mailto:${encodeURIComponent(props.recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <div className="space-y-3">
      <Card className="space-y-2 border-primary" data-testid="invoice-amount">
        <div className="text-sm text-muted-foreground">Gastos a facturar</div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-3xl font-semibold" data-testid="report-total">
            {formatMoney(props.total)}
          </span>
          <Button variant="outline" onClick={() => copy("amount", amount)} data-testid="copy-amount">
            <Copy className="h-4 w-4" aria-hidden /> {copied === "amount" ? "¡Copiado!" : "Copiar importe"}
          </Button>
        </div>
        <div className="flex items-start justify-between gap-2 rounded-lg bg-muted p-2 text-sm">
          <span>{props.invoiceLine}</span>
          <button type="button" className="shrink-0 text-primary" onClick={() => copy("line", props.invoiceLine)}>
            {copied === "line" ? "¡Copiado!" : "Copiar"}
          </button>
        </div>
      </Card>

      <Card className="space-y-2">
        <CardTitle>Descargas</CardTitle>
        <div className="grid grid-cols-3 gap-2">
          {(["pdf", "xlsx", "csv"] as const).map((k) => (
            <a key={k} href={`/api/reports/${props.reportId}/${k}`} className={buttonVariants({ variant: "outline" })} data-testid={`download-${k}`} download>
              <Download className="h-4 w-4" aria-hidden /> {k === "pdf" ? "PDF" : k === "xlsx" ? "Excel" : "CSV"}
            </a>
          ))}
        </div>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <CardTitle>Mail para la empresa</CardTitle>
          <span className="text-xs text-muted-foreground">{status === "saving" ? "Guardando…" : status === "saved" ? "Guardado" : status === "retrying" ? "Reintentando…" : ""}</span>
        </div>
        <div>
          <Label htmlFor="mail-subject">Asunto</Label>
          <Input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} onBlur={persist} />
        </div>
        <div>
          <Label htmlFor="mail-body">Texto</Label>
          <Textarea id="mail-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} onBlur={persist} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => copy("mail", `${subject}\n\n${body}`)} data-testid="copy-mail">
            <Copy className="h-4 w-4" aria-hidden /> {copied === "mail" ? "¡Copiado!" : "Copiar"}
          </Button>
          <a href={mailto} className={buttonVariants({ variant: "outline" })}>
            <Mail className="h-4 w-4" aria-hidden /> Abrir en mi mail
          </a>
        </div>
        <p className="text-xs text-muted-foreground">Los adjuntos (PDF y Excel) se agregan a mano.{props.recipient ? "" : " Configurá el destinatario en Ajustes."}</p>
      </Card>
    </div>
  );
}

export function ReportActions({ reportId, closed, canClose, pendingReview }: { reportId: string; closed: boolean; canClose: boolean; pendingReview: number }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (closed)
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Si necesitás corregir algo, reabrila: los gastos se desbloquean.</p>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Reabrir la rendición? Los gastos incluidos se desbloquean.")) return;
            start(async () => {
              const r = await reopenReportAction(reportId);
              if (r.error) setError(r.error);
              router.refresh();
            });
          }}
        >
          <Unlock className="h-4 w-4" aria-hidden /> Reabrir rendición
        </Button>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    );
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Al cerrar, todos los gastos, km y peajes incluidos quedan marcados como <strong>rendidos</strong> y no se pueden volver a rendir.
        {pendingReview ? ` Ojo: quedan ${pendingReview} gastos por revisar en el período.` : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="success"
          size="lg"
          disabled={pending || !canClose}
          data-testid="close-report"
          onClick={() => {
            if (!confirm("¿Cerrar la rendición?")) return;
            start(async () => {
              const r = await closeReportAction(reportId);
              if (r.error) setError(r.error);
              router.refresh();
            });
          }}
        >
          <Lock className="h-4 w-4" aria-hidden /> Cerrar rendición
        </Button>
        <Button
          variant="ghost"
          className="text-danger"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Borrar este borrador?")) return;
            start(async () => {
              const r = await deleteDraftAction(reportId);
              if (r?.error) setError(r.error);
            });
          }}
        >
          Borrar borrador
        </Button>
      </div>
      {!canClose ? <p className="text-sm text-warning">Para cerrar, cargá los tipos de cambio que faltan y asegurate de que haya gastos.</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
