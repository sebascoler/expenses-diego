import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "../env";
import { isWeekend } from "../format";

/** Entrada minimizada (§16.7, RF-33). Sin cuentas, IBAN, nombres de terceros ni referencias. */
export interface AiItem {
  id: number;
  fecha: string;
  comercio: string;
  monto: string;
  moneda: string;
  fuente: "wise" | "bbva" | "manual";
  tipo_tarjeta: "fisica" | "virtual" | null;
  viaje_candidato: { nombre: string; destino: string | null } | null;
}

export interface AiContext {
  categories: string[];
  trips: { nombre: string; destino: string | null; desde: string | null; hasta: string | null }[];
  decisions: { comercio: string; aplica: boolean; categoria: string | null }[];
}

export interface AiSuggestion {
  id: number;
  applies: boolean | null;
  category: string | null;
  confidence: "alta" | "media" | "baja";
  reason: string;
}

export const BATCH_SIZE = 50;

const BUSINESS_RULES =
  "Diego es consultor y rinde a la empresa los gastos de viajes de trabajo: pasajes, hoteles, transporte, combustible, comidas en viaje. " +
  "Supermercado, streaming, ropa y ocio son personales. Los fines de semana dentro de un viaje pueden ser personales.";

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      applies: z.boolean().nullable(),
      category: z.string().nullable(),
      confidence: z.enum(["alta", "media", "baja"]),
      reason: z.string(),
    }),
  ),
});

export function isAiEnabled(): boolean {
  return Boolean(env.anthropicApiKey) || process.env.AI_MOCK === "1";
}

/** Valida cada ítem: los inválidos se ignoran y quedan "sin clasificar". */
export function validateSuggestions(raw: unknown, batch: AiItem[], categories: string[]): AiSuggestion[] {
  const ids = new Set(batch.map((b) => b.id));
  const cats = new Set(categories);
  const itemSchema = outputSchema.shape.items.element;
  const list = Array.isArray(raw) ? raw : ((raw as { items?: unknown[] } | null)?.items ?? []);
  const out: AiSuggestion[] = [];
  for (const it of list) {
    const parsed = itemSchema.safeParse(it);
    if (!parsed.success || !ids.has(parsed.data.id)) continue;
    const category = parsed.data.category && cats.has(parsed.data.category) ? parsed.data.category : null;
    out.push({ ...parsed.data, category, reason: parsed.data.reason.trim().slice(0, 80) || "Sugerencia de la IA" });
  }
  return out;
}

function buildPrompt(batch: AiItem[], ctx: AiContext): string {
  return [
    `Reglas de negocio: ${BUSINESS_RULES}`,
    `Categorías válidas (usá exactamente uno de estos nombres o null): ${JSON.stringify(ctx.categories)}`,
    `Viajes del período: ${JSON.stringify(ctx.trips)}`,
    `Decisiones recientes de Diego (comercio → aplica, categoría): ${JSON.stringify(ctx.decisions.slice(0, 20))}`,
    "Para cada gasto decidí si lo reembolsa la empresa (applies true), si es personal (false) o si no se puede saber (null).",
    "Devolvé un ítem por cada id, con confidence alta/media/baja y reason en español de hasta 80 caracteres.",
    `Gastos: ${JSON.stringify(batch)}`,
  ].join("\n\n");
}

/** Clasificador determinista para e2e/demos sin API key (AI_MOCK=1). */
function mockClassify(batch: AiItem[]): AiSuggestion[] {
  return batch.map((it) => {
    const m = it.comercio.toUpperCase();
    if (/NETFLIX|SPOTIFY|DISNEY|MERCADONA|CARREFOUR|SUPERMERCADO|ZARA|CINE|FARMACIA|PANADERIA/.test(m))
      return { id: it.id, applies: false, category: null, confidence: "alta", reason: "IA: gasto personal evidente" };
    if (/HOTEL|AIRLINES|AEROLINEAS|LINEAS AEREAS|IBERIA|LATAM|VUELING|BUQUEBUS/.test(m))
      return { id: it.id, applies: true, category: null, confidence: "alta", reason: "IA: pasaje u hotel de viaje de trabajo" };
    if (/UBER|CABIFY|TAXI/.test(m)) {
      const inTrip = Boolean(it.viaje_candidato);
      return {
        id: it.id,
        applies: true,
        category: null,
        confidence: inTrip && !isWeekend(it.fecha) ? "alta" : "media",
        reason: inTrip ? `IA: transporte en ${it.viaje_candidato!.nombre}`.slice(0, 80) : "IA: transporte, revisá si fue de trabajo",
      };
    }
    return { id: it.id, applies: null, category: null, confidence: "baja", reason: "IA: no hay datos suficientes" };
  });
}

async function classifyBatch(client: Anthropic, batch: AiItem[], ctx: AiContext): Promise<AiSuggestion[]> {
  const response = await client.messages.parse(
    {
      model: env.anthropicModel,
      max_tokens: 8000,
      // Claude Haiku 5.5 no acepta `temperature` (400): el determinismo se busca con effort bajo y salida estructurada.
      output_config: { effort: "low", format: zodOutputFormat(outputSchema) },
      system: "Clasificás gastos de un consultor para su rendición mensual a la empresa. Respondés solo con el JSON pedido.",
      messages: [{ role: "user", content: buildPrompt(batch, ctx) }],
    },
    { timeout: 60_000, maxRetries: 2 },
  );
  if (response.stop_reason !== "end_turn" || !response.parsed_output) return [];
  return validateSuggestions(response.parsed_output, batch, ctx.categories);
}

/**
 * Clasifica en lotes de hasta 50, en paralelo (§9.5). Si la IA no está configurada o un lote falla,
 * esos ítems quedan sin sugerencia ("sin clasificar") y no se bloquea nada (RF-34).
 */
export async function classifyWithAi(items: AiItem[], ctx: AiContext): Promise<Map<number, AiSuggestion>> {
  const result = new Map<number, AiSuggestion>();
  if (items.length === 0 || !isAiEnabled()) return result;
  const batches: AiItem[][] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));
  if (!env.anthropicApiKey) {
    for (const b of batches) for (const s of mockClassify(b)) result.set(s.id, s);
    return result;
  }
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const settled = await Promise.allSettled(batches.map((b) => classifyBatch(client, b, ctx)));
  for (const s of settled) {
    if (s.status === "fulfilled") for (const sug of s.value) result.set(sug.id, sug);
    else console.error("[ia] Falló un lote de clasificación:", s.reason instanceof Error ? s.reason.name : "error");
  }
  return result;
}
