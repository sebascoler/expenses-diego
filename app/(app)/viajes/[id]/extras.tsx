"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addMileageAction, addTollAction, deleteExtraAction, deleteTripAction } from "@/app/actions/trips";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function MileageForm({ tripId }: { tripId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (p: { error?: string; ok?: boolean } | undefined, fd: FormData) => {
    const r = await addMileageAction(p, fd);
    if (r?.ok) ref.current?.reset();
    return r;
  }, undefined);
  return (
    <form ref={ref} action={action} className="grid gap-2 sm:grid-cols-4" data-testid="mileage-form">
      <input type="hidden" name="tripId" value={tripId} />
      <div>
        <Label htmlFor="km-total">Km totales</Label>
        <Input id="km-total" name="kmTotal" inputMode="decimal" required />
      </div>
      <div>
        <Label htmlFor="km-ded">Km a descontar</Label>
        <Input id="km-ded" name="kmDeduction" inputMode="decimal" defaultValue="0" />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="km-reason">Motivo del descuento</Label>
        <Input id="km-reason" name="reason" placeholder="Ida y vuelta a lo de mamá" />
      </div>
      {state?.error ? <p className="text-sm text-danger sm:col-span-4">{state.error}</p> : null}
      <Button type="submit" variant="outline" disabled={pending} className="sm:col-span-4">
        Agregar km
      </Button>
    </form>
  );
}

export function TollForm({ tripId }: { tripId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(async (p: { error?: string; ok?: boolean } | undefined, fd: FormData) => {
    const r = await addTollAction(p, fd);
    if (r?.ok) ref.current?.reset();
    return r;
  }, undefined);
  return (
    <form ref={ref} action={action} className="grid gap-2 sm:grid-cols-4" data-testid="toll-form">
      <input type="hidden" name="tripId" value={tripId} />
      <div>
        <Label htmlFor="toll-amount">Monto</Label>
        <Input id="toll-amount" name="amount" inputMode="decimal" required />
      </div>
      <div>
        <Label htmlFor="toll-currency">Moneda</Label>
        <Input id="toll-currency" name="currency" defaultValue="EUR" maxLength={3} required />
      </div>
      <div>
        <Label htmlFor="toll-date">Fecha (opcional)</Label>
        <Input id="toll-date" name="date" type="date" />
      </div>
      <div>
        <Label htmlFor="toll-note">Nota</Label>
        <Input id="toll-note" name="note" placeholder="Total del viaje" />
      </div>
      {state?.error ? <p className="text-sm text-danger sm:col-span-4">{state.error}</p> : null}
      <Button type="submit" variant="outline" disabled={pending} className="sm:col-span-4">
        Agregar peaje
      </Button>
    </form>
  );
}

export function DeleteExtraButton({ kind, id, tripId }: { kind: "km" | "toll"; id: string; tripId: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" aria-label="Borrar" disabled={pending} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-card" onClick={() => start(async () => void (await deleteExtraAction(kind, id, tripId)))}>
      <Trash2 className="h-4 w-4" aria-hidden />
    </button>
  );
}

export function DeleteTripButton({ id }: { id: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <Button
        variant="ghost"
        className="text-danger"
        disabled={pending}
        onClick={() => {
          if (!confirm("¿Borrar el viaje? Los gastos vuelven a asignarse por fecha.")) return;
          start(async () => {
            const r = await deleteTripAction(id);
            if (r?.error) setError(r.error);
          });
        }}
      >
        Borrar viaje
      </Button>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
