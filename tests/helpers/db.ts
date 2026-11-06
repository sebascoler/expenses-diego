import { readFileSync } from "node:fs";
import path from "node:path";
import { getDb, resetDbForTests } from "@/lib/db/client";

export async function freshDb() {
  resetDbForTests();
  return getDb();
}

export function fixture(name: string): Buffer {
  return readFileSync(path.join(process.cwd(), "fixtures", name));
}
