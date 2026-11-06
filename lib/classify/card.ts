/** Regla de tarjeta (RF-31): la virtual sugiere empresa y la física personal, con confianza media. */
export function cardSuggestion(cardType: "fisica" | "virtual" | null | undefined) {
  if (!cardType) return null;
  return cardType === "virtual"
    ? { applies: true, confidence: "media" as const, reason: "tarjeta virtual (pensada para la empresa)" }
    : { applies: false, confidence: "media" as const, reason: "tarjeta física (pensada para lo personal)" };
}
