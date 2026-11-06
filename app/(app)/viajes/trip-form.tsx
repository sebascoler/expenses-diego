"use client";

import { useActionState } from "react";
import { saveTripAction } from "@/app/actions/trips";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";

export function TripForm({ trip }: { trip?: { id: string; name: string; destination: string | null; dateFrom: string | null; dateTo: string | null; notes: string | null } }) {
  const [state, action, pending] = useActionState(saveTripAction, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2" data-testid="trip-form">
      {trip ? <input type="hidden" name="id" value={trip.id} /> : null}
      <div className="sm:col-span-2">
        <Label htmlFor="trip-name">Nombre</Label>
        <Input id="trip-name" name="name" placeholder="Lima – Visita proveedores" defaultValue={trip?.name} required />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="trip-destination">Destino</Label>
        <Input id="trip-destination" name="destination" placeholder="Lima, Perú" defaultValue={trip?.destination ?? ""} />
      </div>
      <div>
        <Label htmlFor="trip-from">Desde</Label>
        <Input id="trip-from" name="dateFrom" type="date" defaultValue={trip?.dateFrom ?? ""} required />
      </div>
      <div>
        <Label htmlFor="trip-to">Hasta</Label>
        <Input id="trip-to" name="dateTo" type="date" defaultValue={trip?.dateTo ?? ""} required />
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor="trip-notes">Notas</Label>
        <Textarea id="trip-notes" name="notes" rows={2} defaultValue={trip?.notes ?? ""} />
      </div>
      {state?.error ? <p className="text-sm text-danger sm:col-span-2">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="sm:col-span-2">
        {trip ? "Guardar cambios" : "Crear viaje"}
      </Button>
    </form>
  );
}
