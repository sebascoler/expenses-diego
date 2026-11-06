"use client";

import { useActionState } from "react";
import { manualFxAction } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ManualFxForm({ currency, reportId }: { currency: string; reportId: string | null }) {
  const [state, action, pending] = useActionState(manualFxAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" data-testid={`manual-fx-${currency}`}>
      <input type="hidden" name="currency" value={currency} />
      {reportId ? <input type="hidden" name="reportId" value={reportId} /> : null}
      <label htmlFor={`fx-${currency}`}>1 EUR =</label>
      <Input id={`fx-${currency}`} name="units" inputMode="decimal" className="w-28" placeholder="45,50" required />
      <span>{currency}</span>
      <Button type="submit" size="sm" disabled={pending}>
        Aplicar
      </Button>
      {state?.error ? <span className="w-full text-danger">{state.error}</span> : null}
      {state?.ok ? <span className="w-full text-success">{state.ok}</span> : null}
    </form>
  );
}
