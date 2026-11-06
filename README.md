# Expenses Diego

Herramienta web para preparar la rendición mensual de gastos de Diego. Importa los movimientos de Wise y BBVA, los clasifica (empresa o personal, viaje, categoría) y calcula km y peajes. Al final genera el PDF, el Excel/CSV, el borrador del mail y el importe a facturar.

- Requisitos y guía de implementación: [`docs/PRD.md`](docs/PRD.md) (ver §16) · Decisiones: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Guía de uso para Diego: [`docs/GUIA-DIEGO.md`](docs/GUIA-DIEGO.md)
- Stack: Next.js 16 (App Router) · Tailwind · Drizzle + Neon (PGlite en dev/test) · Zod · PapaParse + SheetJS · @react-pdf/renderer + exceljs · Claude API · Resend · Vitest + Playwright

## Desarrollo local

No hace falta ningún servicio externo: sin `DATABASE_URL` usa PGlite en `.pglite/`, y funciona sin `ANTHROPIC_API_KEY` y sin `RESEND_API_KEY`.

```bash
pnpm install
```

```bash
pnpm db:seed:demo        # fixtures sintéticos + 2 viajes de ejemplo
```

```bash
NEW_PASSWORD='una-clave-de-12+' pnpm user:create sebastian
```

```bash
pnpm dev
```

Variables útiles en dev: `FX_PROVIDER=fixture` (tasas fijas, sin red) y `AI_MOCK=1` (clasificador determinista sin API key).

## Scripts

| Script | Qué hace |
|---|---|
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` | Checks (correr antes de commitear) |
| `pnpm db:generate` | Genera la migración SQL desde `lib/db/schema.ts` |
| `pnpm db:migrate` | Aplica migraciones (Neon si hay `DATABASE_URL`, si no PGlite) |
| `pnpm db:reset` | Borra **todos** los datos (pide escribir el nombre de la base) |
| `pnpm db:seed:demo` | Carga los fixtures y 2 viajes de ejemplo |
| `pnpm fixtures:generate` | Regenera los fixtures sintéticos (deterministas) |
| `pnpm user:create [usuario]` · `pnpm user:reset-password [usuario]` | Usuario único (la contraseña se pide oculta o por `NEW_PASSWORD`) |

## Deploy en Vercel (§16.9)

1. Vercel → Add New Project → importar `sebascoler/expenses-diego` (framework: Next.js; el build usa `pnpm vercel-build`, que aplica las migraciones).
2. Storage → agregar **Neon** desde el Marketplace (inyecta `DATABASE_URL`). Crear una branch `dev` de Neon para los previews.
3. Cargar en Production (y Preview) las variables de [`.env.example`](.env.example): `SESSION_SECRET`, `ENCRYPTION_KEY`, `DEDUP_HMAC_KEY`, `CRON_SECRET` (cada una con `openssl rand -base64 32`), `APP_URL`, `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD` (mín. 12 caracteres) y, opcionales, `ANTHROPIC_API_KEY`, `RESEND_API_KEY` y `MAIL_FROM`.
4. Deploy. El cron (`vercel.json`) llama a `/api/cron/reminder` todos los días a las 12:00 UTC.
5. Entrar con el usuario de bootstrap. Después de usarlo, borrar `BOOTSTRAP_PASSWORD` de Vercel.

**Entrega a Diego:** Ajustes → "Borrar todos los datos" (pide la contraseña y escribir `BORRAR`) → cambiar `BOOTSTRAP_USERNAME`/`BOOTSTRAP_PASSWORD` por los de Diego y rotar `SESSION_SECRET` y `CRON_SECRET` → redeploy → Diego entra y cambia la contraseña desde Ajustes. Alternativa por CLI: `pnpm db:reset` y `pnpm user:create` con `DATABASE_URL` de producción.

## Seguridad

Los archivos subidos se procesan en memoria y se descartan (solo se guarda su hash). La descripción original y las notas se cifran con AES-256-GCM. A la IA solo se le manda comercio normalizado, monto, moneda, fecha, fuente, tipo de tarjeta y viaje candidato. Nunca se commitean datos reales, `.env` ni secretos: los fixtures de `fixtures/` son sintéticos.
