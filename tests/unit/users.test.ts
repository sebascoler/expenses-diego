import { beforeEach, describe, expect, it } from "vitest";
import { login } from "@/lib/auth/login";
import { createUser, deleteUser, listUsers, needsTour, setTourCompleted, UserError } from "@/lib/auth/users";
import type { DB } from "@/lib/db/client";
import { freshDb } from "../helpers/db";

let db: DB;
beforeEach(async () => {
  db = await freshDb();
});

describe("usuarios (mismos datos, varios logins)", () => {
  it("crea un usuario normalizado y puede entrar", async () => {
    const u = await createUser(db, "  Diego ", "clave-de-diego-123");
    expect(u.username).toBe("diego");
    const r = await login(db, "DIEGO", "clave-de-diego-123", "1.1.1.1");
    expect(r.ok).toBe(true);
  });

  it("valida nombre, largo de contraseña y duplicados", async () => {
    await expect(createUser(db, "con espacio", "clave-de-diego-123")).rejects.toBeInstanceOf(UserError);
    await expect(createUser(db, "diego", "corta")).rejects.toThrow(/12 caracteres/);
    await createUser(db, "diego", "clave-de-diego-123");
    await expect(createUser(db, "Diego", "otra-clave-larga-1")).rejects.toThrow(/Ya existe/);
  });

  it("no deja borrarse a sí mismo ni dejar la app sin usuarios", async () => {
    const a = await createUser(db, "sebastian", "clave-sebastian-1");
    const b = await createUser(db, "diego", "clave-de-diego-123");
    await expect(deleteUser(db, a.id, a.id)).rejects.toThrow(/propio/);
    await deleteUser(db, b.id, a.id);
    expect((await listUsers(db)).map((u) => u.username)).toEqual(["sebastian"]);
  });

  it("el tutorial se muestra hasta que se termina, y se puede volver a ver", async () => {
    const u = await createUser(db, "diego", "clave-de-diego-123");
    expect(await needsTour(db, u.id)).toBe(true);
    await setTourCompleted(db, u.id, true);
    expect(await needsTour(db, u.id)).toBe(false);
    await setTourCompleted(db, u.id, false);
    expect(await needsTour(db, u.id)).toBe(true);
  });
});
