import { expect, type Page } from "@playwright/test";
import path from "node:path";

export const USER = "e2e";
export const PASS = "e2e-password-123";
export const fixture = (name: string) => path.join(process.cwd(), "fixtures", name);

export async function login(page: Page, opts: { user?: string; pass?: string; tour?: "skip" | "keep" } = {}) {
  await page.goto("/login");
  await page.getByLabel("Usuario").fill(opts.user ?? USER);
  await page.getByLabel("Contraseña").fill(opts.pass ?? PASS);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
  if (opts.tour !== "keep") await skipTourIfShown(page);
}

/** La primera vez que entra cada usuario aparece el tutorial: en los tests que no lo prueban, se saltea. */
export async function skipTourIfShown(page: Page) {
  const tour = page.getByTestId("welcome-tour");
  try {
    await tour.waitFor({ state: "visible", timeout: 3000 });
  } catch {
    return;
  }
  await tour.getByRole("button", { name: "Saltar" }).click();
  await expect(tour).toHaveCount(0);
}

/** Login + "Borrar todos los datos" (§16.9) + login de nuevo por bootstrap: cada test arranca con la base vacía. */
export async function freshStart(page: Page) {
  await login(page);
  await page.goto("/ajustes");
  const wipe = page.getByTestId("wipe-form");
  await wipe.getByLabel("Tu contraseña").fill(PASS);
  await wipe.getByLabel("Escribí BORRAR").fill("BORRAR");
  await wipe.getByRole("button", { name: "Borrar todos los datos" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page);
}
