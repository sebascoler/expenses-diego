export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionConfig } = await import("./lib/env");
    // Falla rápido en producción si faltan secretos obligatorios (§16.8).
    assertProductionConfig();
  }
}
