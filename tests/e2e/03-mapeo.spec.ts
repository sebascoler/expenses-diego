import { expect, test } from "@playwright/test";
import { fixture, freshStart } from "./helpers";

test("importar un archivo desconocido con mapeo manual de columnas (RF-16)", async ({ page }) => {
  await freshStart(page);
  await page.goto("/importar");
  await page.getByTestId("file-input").setInputFiles(fixture("bbva-unknown.xlsx"));
  const form = page.getByTestId("mapping-form");
  await expect(form).toBeVisible({ timeout: 30_000 });
  await expect(form.getByText("F. Operación").first()).toBeVisible();
  await form.getByLabel("¿De qué banco es?").selectOption("bbva");
  await form.getByLabel("Fecha *").selectOption("F. Operación");
  await form.getByLabel("Descripción / comercio *").selectOption("Concepto");
  await form.getByLabel("Débito (si va separado)").selectOption("Débito");
  await form.getByLabel("Crédito (si va separado)").selectOption("Crédito");
  await form.getByLabel("Moneda", { exact: true }).selectOption("Div.");
  await form.getByRole("button", { name: "Importar con este mapeo" }).click();
  await expect(page.getByText("Se leyeron 41 movimientos: 39 nuevos, 0 duplicados ignorados, 2 no son gastos")).toBeVisible({ timeout: 30_000 });
  await page.goto("/revision?f=fuente&source=bbva");
  await expect(page.getByTestId("tx-row")).toHaveCount(39);
});
