"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createReportAction } from "@/app/actions/reports";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function NewReportForm({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const router = useRouter();
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo] = useState(dateTo);
  const [state, action, pending] = useActionState(createReportAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
      <div>
        <Label htmlFor="r-from">Desde</Label>
        <Input id="r-from" name="dateFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
      </div>
      <div>
        <Label htmlFor="r-to">Hasta</Label>
        <Input id="r-to" name="dateTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
      </div>
      <Button type="button" variant="outline" onClick={() => router.push(`/rendiciones/nueva?desde=${from}&hasta=${to}`)}>
        Actualizar vista previa
      </Button>
      <Button type="submit" disabled={pending}>
        Crear rendición
      </Button>
      {state?.error ? <p className="text-sm text-danger sm:col-span-4">{state.error}</p> : null}
    </form>
  );
}
