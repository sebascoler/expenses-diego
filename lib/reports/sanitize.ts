/**
 * Protección contra CSV/formula injection (RF-73): las celdas que empiezan con = + - @ (o tab/CR)
 * se prefijan con un apóstrofo para que Excel las trate como texto.
 */
export function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
