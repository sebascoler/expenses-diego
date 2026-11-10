import { expect, test } from "@playwright/test";
import { freshStart, login, PASS } from "./helpers";

test("tutorial de bienvenida y alta de un segundo usuario", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await freshStart(page);

  // Ver el tutorial de nuevo desde Ajustes y recorrerlo entero
  await page.goto("/ajustes");
  await page.getByRole("button", { name: "Ver el tutorial de nuevo" }).click();
  await expect(page).toHaveURL(/\/$/);
  const tour = page.getByTestId("welcome-tour");
  await expect(tour).toBeVisible();
  await expect(tour.getByText("1 de 9")).toBeVisible();
  for (let i = 2; i <= 9; i++) {
    await tour.getByRole("button", { name: "Siguiente" }).click();
    await expect(tour.getByText(`${i} de 9`)).toBeVisible();
  }
  await tour.getByRole("button", { name: "Terminar" }).click();
  await expect(tour).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(1000);
  await expect(page.getByTestId("welcome-tour")).toHaveCount(0);

  // Crear un segundo usuario
  await page.goto("/ajustes");
  const form = page.getByTestId("new-user-form");
  await form.getByLabel("Usuario nuevo").fill("Diego");
  await form.getByLabel("Contraseña temporal (mín. 12)").fill("clave-de-diego-123");
  await form.getByLabel("Repetir contraseña").fill("clave-de-diego-123");
  await form.getByRole("button", { name: "Crear usuario" }).click();
  await expect(page.getByText('Usuario "diego" creado')).toBeVisible();
  await expect(page.getByTestId("users-list")).toContainText("diego");

  // El usuario nuevo entra, ve su propio tutorial y los mismos datos
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(page, { user: "diego", pass: "clave-de-diego-123", tour: "keep" });
  await expect(page.getByTestId("welcome-tour")).toBeVisible();
  await page.getByTestId("welcome-tour").getByRole("button", { name: "Saltar" }).click();
  await expect(page.getByTestId("welcome-tour")).toHaveCount(0);

  // Diego borra al otro usuario (no puede borrarse a sí mismo)
  await page.goto("/ajustes");
  await expect(page.getByRole("button", { name: "Borrar usuario diego" })).toHaveCount(0);
  await page.getByRole("button", { name: "Borrar usuario e2e" }).click();
  await expect(page.getByText("Usuario borrado.")).toBeVisible();
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Usuario").fill("e2e");
  await page.getByLabel("Contraseña").fill(PASS);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Usuario o contraseña incorrectos.")).toBeVisible();

  // Dejar la base vacía para los tests siguientes (el bootstrap vuelve a crear "e2e")
  await login(page, { user: "diego", pass: "clave-de-diego-123" });
  await page.goto("/ajustes");
  const wipe = page.getByTestId("wipe-form");
  await wipe.getByLabel("Tu contraseña").fill("clave-de-diego-123");
  await wipe.getByLabel("Escribí BORRAR").fill("BORRAR");
  await wipe.getByRole("button", { name: "Borrar todos los datos" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
