"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { createUser, deleteUser, setTourCompleted, UserError } from "@/lib/auth/users";
import { getDb } from "@/lib/db/client";

type State = { error?: string; ok?: string } | undefined;

export async function createUserAction(_prev: State, fd: FormData): Promise<State> {
  const s = await requireSession();
  const p = z.object({ username: z.string().max(60), password: z.string().max(200), confirm: z.string().max(200) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Completá los campos." };
  if (p.data.password !== p.data.confirm) return { error: "Las contraseñas no coinciden." };
  try {
    const u = await createUser(await getDb(), p.data.username, p.data.password, s.userId);
    revalidatePath("/ajustes");
    return { ok: `Usuario "${u.username}" creado. Pasale la contraseña por un canal seguro y pedile que la cambie al entrar.` };
  } catch (e) {
    return { error: e instanceof UserError ? e.message : "No se pudo crear el usuario." };
  }
}

export async function deleteUserAction(id: string): Promise<State> {
  const s = await requireSession();
  try {
    await deleteUser(await getDb(), z.string().uuid().parse(id), s.userId);
    revalidatePath("/ajustes");
    return { ok: "Usuario borrado." };
  } catch (e) {
    return { error: e instanceof UserError ? e.message : "No se pudo borrar el usuario." };
  }
}

/** Terminar o saltear el tutorial (no se vuelve a mostrar). */
export async function completeTourAction() {
  const s = await requireSession();
  await setTourCompleted(await getDb(), s.userId, true);
}

/** "Ver el tutorial de nuevo" desde Ajustes. */
export async function restartTourAction() {
  const s = await requireSession();
  await setTourCompleted(await getDb(), s.userId, false);
  revalidatePath("/", "layout");
}
