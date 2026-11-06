import { daysBetween } from "../format";

export interface TripRange {
  id: string;
  name: string;
  destination: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  isGeneral: boolean;
}

/**
 * Asignación de viaje por fecha (RF-32): si cae dentro de un viaje, ese viaje; si cae fuera, Gastos generales.
 * Con viajes solapados se elige el más corto y se marca para revisar.
 */
export function assignTrip(date: string, trips: TripRange[], generalId: string | null): { tripId: string | null; needsReview: boolean } {
  const candidates = trips.filter((t) => !t.isGeneral && t.dateFrom && t.dateTo && t.dateFrom <= date && date <= t.dateTo);
  if (candidates.length === 0) return { tripId: generalId, needsReview: false };
  candidates.sort((a, b) => daysBetween(a.dateFrom!, a.dateTo!) - daysBetween(b.dateFrom!, b.dateTo!));
  return { tripId: candidates[0].id, needsReview: candidates.length > 1 };
}
