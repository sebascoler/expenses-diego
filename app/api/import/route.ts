import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth/api";
import { getDb } from "@/lib/db/client";
import { importFile } from "@/lib/import/pipeline";
import { columnMappingSchema } from "@/lib/parsers/column-map";
import { MAX_FILE_BYTES } from "@/lib/parsers/table";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST multipart (un archivo por request). El archivo se procesa en memoria y se descarta (RF-13). */
export async function POST(req: Request) {
  const s = await requireApiSession();
  if (s instanceof NextResponse) return s;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ status: "invalid", fileName: "", message: "No se pudo leer el archivo enviado." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ status: "invalid", fileName: "", message: "Falta el archivo." }, { status: 400 });
  const fileName = file.name.slice(0, 200);
  if (file.size > MAX_FILE_BYTES) return NextResponse.json({ status: "invalid", fileName, message: "El archivo supera el máximo de 5 MB." });
  let mapping;
  const rawMapping = form.get("mapping");
  if (typeof rawMapping === "string" && rawMapping) {
    let obj: unknown = null;
    try {
      obj = JSON.parse(rawMapping);
    } catch {
      /* se valida abajo */
    }
    const parsed = columnMappingSchema.safeParse(obj);
    if (!parsed.success) return NextResponse.json({ status: "invalid", fileName, message: parsed.error.issues[0]?.message ?? "Mapeo inválido." });
    mapping = parsed.data;
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const out = await importFile(await getDb(), { buffer, fileName, mapping });
    return NextResponse.json(out);
  } catch (err) {
    console.error("[import] error:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ status: "invalid", fileName, message: "Ocurrió un error al procesar el archivo. No se importó nada." }, { status: 500 });
  }
}
