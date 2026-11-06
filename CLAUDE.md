# Expenses Diego — instrucciones para agentes

**La fuente de verdad es [`docs/PRD.md`](docs/PRD.md).** Leé el documento completo antes de empezar. La §16 ("Guía de implementación para agentes") es el contrato operativo: define qué significa "listo", los defaults, la estructura del repo, los scripts, los fixtures, el contrato de la IA, el deploy y los tests.

## Reglas
- Objetivo: una webapp deployada en Vercel y lista para probar el **14/11/2026** (§16.1).
- No te frenes por las preguntas abiertas de §13: usá los defaults de §16.2. Las decisiones nuevas van en `docs/DECISIONS.md`.
- Seguridad (§10): nunca se guardan los archivos crudos; nunca se commitean datos reales, `.env` ni secretos; a la IA solo se le mandan datos minimizados (§16.7).
- Dinero siempre con `Decimal`. Textos de la UI en español rioplatense. Mobile-first (390 px).
- La app tiene que funcionar sin `DATABASE_URL` (PGlite), sin `ANTHROPIC_API_KEY` y sin `RESEND_API_KEY` (§16.5).
- Antes de commitear: `pnpm lint && pnpm typecheck && pnpm test`. Antes de dar por terminado, también `pnpm test:e2e`.

## Stack
Next.js (App Router) + TypeScript · Tailwind + shadcn/ui · Drizzle + Neon (PGlite en dev/test) · Zod · PapaParse + SheetJS · @react-pdf/renderer + exceljs · Anthropic SDK · Resend · Vitest + Playwright · pnpm.
