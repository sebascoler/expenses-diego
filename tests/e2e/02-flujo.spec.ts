import { expect, test } from "@playwright/test";
import { fixture, freshStart } from "./helpers";

test("flujo completo: importar → revisar → viaje → km y peaje → rendición → descargas → cerrar", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  page.on("dialog", (d) => d.accept());
  await freshStart(page);

  // Importar los 2 fixtures
  await page.goto("/importar");
  await page.getByTestId("file-input").setInputFiles([fixture("wise-sample.csv"), fixture("bbva-sample.xlsx")]);
  const summaries = page.getByTestId("import-summary");
  await expect(summaries).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByText("Se leyeron 57 movimientos: 48 nuevos, 0 duplicados ignorados, 9 no son gastos")).toBeVisible();
  await expect(page.getByText("Se leyeron 41 movimientos: 39 nuevos, 0 duplicados ignorados, 2 no son gastos")).toBeVisible();
  await page.getByRole("link", { name: "Ir a revisar" }).click();
  await expect(page).toHaveURL(/\/revision/);

  // Aceptar las de confianza alta y marcar 2 como personal
  await page.getByRole("button", { name: /Aceptar todas las de confianza alta/ }).click();
  await expect(page.getByText(/Se aceptaron \d+ sugerencias de confianza alta/)).toBeVisible();
  const rows = page.getByTestId("tx-row");
  await expect(rows.first()).toBeVisible();
  for (let i = 0; i < 2; i++) {
    const row = rows.nth(i);
    await row.getByRole("button", { name: "No aplica" }).click();
    await expect(row).toHaveAttribute("data-applies", "false");
  }
  await expect(page.getByTestId("saved")).toBeVisible();

  // Crear viaje (asigna por fecha) y cargar km y peaje
  await page.goto("/viajes");
  const form = page.getByTestId("trip-form");
  await form.getByLabel("Nombre").fill("Montevideo – Cliente");
  await form.getByLabel("Destino").fill("Montevideo");
  await form.getByLabel("Desde").fill("2026-10-20");
  await form.getByLabel("Hasta").fill("2026-10-23");
  await form.getByRole("button", { name: "Crear viaje" }).click();
  await expect(page.getByRole("heading", { name: "Montevideo – Cliente" })).toBeVisible();
  const km = page.getByTestId("mileage-form");
  await km.getByLabel("Km totales").fill("1250");
  await km.getByLabel("Km a descontar").fill("200");
  await km.getByLabel("Motivo del descuento").fill("Uso personal");
  await km.getByRole("button", { name: "Agregar km" }).click();
  await expect(page.getByText("€ 367,50").first()).toBeVisible();
  const toll = page.getByTestId("toll-form");
  await toll.getByLabel("Monto").fill("12,50");
  await toll.getByRole("button", { name: "Agregar peaje" }).click();
  await expect(page.getByText("€ 12,50").first()).toBeVisible();

  // Nueva rendición
  await page.goto("/rendiciones/nueva?desde=2026-08-01&hasta=2026-11-10");
  await page.getByRole("button", { name: "Crear rendición" }).click();
  await expect(page).toHaveURL(/\/rendiciones\/[0-9a-f-]{36}$/);
  // Tipos de cambio manuales si faltan (monedas sin BCE)
  for (const f of await page.locator("[data-testid^=manual-fx-]").all()) {
    await f.locator("input[name=units]").fill("45,5");
    await f.getByRole("button", { name: "Aplicar" }).click();
    await expect(f.getByText(/Tipo de cambio aplicado/)).toBeVisible();
  }
  await page.reload();
  await expect(page.locator("[data-testid^=manual-fx-]")).toHaveCount(0);
  const total = await page.getByTestId("report-total").innerText();
  expect(total).toMatch(/^€ [\d.]+,\d{2}$/);
  expect(total).not.toBe("€ 0,00");

  // Descargas
  const pdfHref = await page.getByTestId("download-pdf").getAttribute("href");
  const pdf = await page.request.get(pdfHref!);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  const xlsx = await page.request.get((await page.getByTestId("download-xlsx").getAttribute("href"))!);
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");
  const csv = await page.request.get((await page.getByTestId("download-csv").getAttribute("href"))!);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("Montevideo – Cliente");

  // Copiar el importe y el mail
  await page.getByTestId("copy-amount").click();
  await expect(page.getByTestId("copy-amount")).toHaveText(/Copiado/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(total.replace("€ ", "").replace(/\./g, ""));
  await page.getByTestId("copy-mail").click();
  await expect(page.getByTestId("copy-mail")).toHaveText(/Copiado/);

  // Cerrar la rendición
  await page.getByTestId("close-report").click();
  await expect(page.getByTestId("report-status")).toHaveText("Cerrada");

  // Los gastos aparecen como "Rendido" y lo rendido no se vuelve a rendir
  await page.goto("/revision?f=rendidos");
  await expect(page.getByTestId("tx-row").first()).toBeVisible();
  await expect(page.getByTestId("tx-row").first().getByText("Rendido")).toBeVisible();
  await page.goto("/rendiciones/nueva?desde=2026-08-01&hasta=2026-11-10");
  await expect(page.getByTestId("preview-total")).toHaveText("€ 0,00");
});
