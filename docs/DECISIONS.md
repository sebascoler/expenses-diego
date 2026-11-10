# Registro de decisiones

Decisiones de implementación que no están en el PRD o que lo modifican. Formato: fecha · decisión · motivo.

- 06/11/2026 · Base de datos: Neon Postgres (free), con PGlite para dev y tests · Integración nativa con Vercel, branching para separar pruebas de producción, y tests sin red.
- 06/11/2026 · Los archivos bancarios no se almacenan, solo su hash · Minimiza la superficie de riesgo.
- 06/11/2026 · Usuario único, creado por bootstrap de variables de entorno o por script; sin 2FA en v1 · Pedido explícito: Sebastián prueba, se borra la base y se entrega a Diego.

## Implementación v1 (06/11/2026)

- **Next.js 16: `proxy.ts` en lugar de `middleware.ts`** · En Next 16 `middleware` quedó deprecado y se llama `proxy`. Cumple la misma función que §16.3: redirige a `/login` si no hay cookie y además pone la CSP con nonce. La validación real de la sesión es en el servidor (`app/(app)/layout.tsx` y cada Server Action o route handler).
- **TypeScript 5.9 y ESLint 9** · TS 7 (nativo) y ESLint 10 todavía no los soportan bien Next ni sus plugins. Todas las versiones están fijadas (sin `^`).
- **SheetJS 0.20.3 desde el tarball oficial de cdn.sheetjs.com** · Como pide §9.1 (la versión de npm, 0.18.5, tiene vulnerabilidades conocidas). El entorno de desarrollo necesitó permitir ese host.
- **shadcn/ui: componentes escritos a mano con el mismo estilo** (`components/ui`, cva + tailwind-merge) · El CLI de shadcn necesita red hacia su registro; son pocos componentes y así no hay dependencias pesadas en el cliente.
- **La sugerencia se guarda aparte de la decisión** · Se agregaron `suggested_applies` y la decisión (`applies`) queda en `null` ("por revisar") hasta que Diego la confirma. Esto hace posible "Aceptar todas las de confianza alta" (RF-43) sin que la IA o una regla decida sola.
- **Columnas extra en `transactions`**: `account_amount`/`account_currency` (monto debitado en la moneda de la cuenta, para el tipo de cambio de la fuente), `fee_fx_rate` (el fee de Wise está en la moneda del balance, no en la del comercio), `dedup_key_prev` (clave del pendiente fusionado, para que re-importar el archivo viejo no lo duplique), `possible_match_id` (coincidencia ambigua pendiente↔consolidado), `trip_needs_review` (viajes solapados). También `report_id` en `trip_mileage` y `trip_tolls` para bloquearlos al cerrar (RF-76), y `fx_rate` en `trip_tolls`.
- **Tabla `merchant_decisions`** · Guarda las decisiones de Diego por comercio: alimenta el aprendizaje (RF-35: a la 2.ª corrección se ofrece la regla) y las "20 decisiones recientes" del contexto de la IA (§16.7).
- **Fee de Wise**: el `Amount` del CSV incluye el fee; se separa al importar para poder sumarlo o no (RF-22). El monto original es el de la moneda del comercio (`Exchange To Amount`) y el tipo de cambio de Wise se deriva de lo debitado.
- **Transferencias de Wise**: el comercio se guarda como "TRANSFERENCIA ENVIADA" (la descripción completa va cifrada), para no mandar nombres de terceros a la IA. Las transferencias a uno mismo (destinatario = titular) son `no_gasto`. Los movimientos positivos (recargas, devoluciones, cashback, intereses) son `no_gasto`.
- **Dedup sin ID externo**: si dos filas idénticas aparecen en el mismo archivo (dos cafés iguales el mismo día) se agrega el número de ocurrencia a la clave. Así re-importar el mismo archivo o uno solapado da las mismas claves y no se pierden gastos legítimos.
- **Reconciliación**: con un único pendiente candidato se fusiona; con varios se inserta el consolidado marcado como "posible coincidencia" y Diego confirma en la revisión. Si el pendiente ya fue rendido, el consolidado cuenta como duplicado (nunca se factura dos veces).
- **Montos de BBVA**: negativo = gasto. Si un archivo real trae los gastos en positivo, el mapeo manual tiene la opción "los gastos figuran con signo positivo". Sin columna de moneda se usa USD (configurable por mapeo).
- **Tipo de cambio manual**: Diego ingresa "1 EUR = X <moneda>" y se aplica a todas las líneas sin rendir de esa moneda que no tienen tipo de cambio. Queda cacheado como tasa manual y se reutiliza para movimientos de la misma moneda de hasta 60 días antes. Para el BCE se usa `api.frankfurter.dev/v1` (la URL `.app` redirige ahí), con una consulta por moneda y rango. En tests y e2e, `FX_PROVIDER=fixture` usa `fixtures/fx-rates.json`.
- **IA**: `claude-haiku-5-5` con salida estructurada (`messages.parse` + `zodOutputFormat`) y validación Zod por ítem. **No se manda `temperature: 0`** porque Claude Haiku 5.5 rechaza valores de muestreo distintos del default (400); en su lugar se usa `effort: "low"`. Además de las reglas del usuario hay pistas deterministas de *categoría* por palabra clave (nunca deciden si aplica). `AI_MOCK=1` activa un clasificador determinista para e2e y demos sin API key.
- **Rango de la rendición**: el borrador guarda el rango; mientras está en borrador los entregables se calculan en vivo con lo no rendido del rango. Al cerrar se marca todo lo incluido y desde ahí se regenera con exactamente esas líneas. Km y peajes entran si el viaje se solapa con el rango (los de "Gastos generales", si la fecha del peaje cae en el rango o no tiene fecha).
- **Recordatorio**: el cron corre una vez por día a las 12:00 UTC (09:00 en Buenos Aires). Manda el mail el día configurado si ya pasó la hora configurada; si ese día falló, lo manda en los días siguientes del mismo mes. Se registra la fecha de envío para no repetir.
- **CSP**: `script-src` con nonce y `strict-dynamic`; `style-src` permite `'unsafe-inline'` (estilos inline de React/Next) porque el riesgo es bajo y bloquearlos rompe componentes.
- **PWA**: manifest e ícono para instalarla en el teléfono; sin service worker, para no cachear pantallas con datos bancarios.
- **Límite de subida en Vercel**: las funciones aceptan hasta ~4,5 MB por request. Los archivos se suben de a uno; el máximo efectivo en Vercel es ~4,5 MB (en local, 5 MB). Los extractos reales pesan mucho menos.
- **Ajustes en jsonb envueltos en `{ v }`** · Drizzle parsea como JSON los strings guardados en jsonb ("0.35" volvía como número).
- **Borrar todos los datos** también borra `audit_log` y `login_attempts`, y deja registrado el borrado como primera entrada del log nuevo.
- **`uuid` forzado a 11.1.1** (override de pnpm) · `exceljs` traía una versión con un aviso de seguridad moderado.

## 10/11/2026

- **Varios usuarios con los mismos datos** · Pedido: Diego es el usuario real y Sebastián entra como tester. Se agregó Ajustes → Usuarios (crear con contraseña temporal de 12+ caracteres, listar, borrar). No hay datos por usuario: todos ven y editan lo mismo, por eso alcanza con más filas en `users` y no hace falta tocar el resto del modelo. No se puede borrar el propio usuario ni dejar la app sin usuarios. "Borrar todos los datos" sigue borrando a **todos** los usuarios (entrega limpia, §16.9).
- **Tutorial de bienvenida** · Recorrido de 9 pasos con tooltips sobre Inicio (resumen, archivos a bajar, Importar, Revisión, Viajes, Rendir, Ajustes). Se muestra la primera vez que entra cada usuario (`users.tour_completed_at`, migración `0001_user_tour`), se puede saltear (también con Esc) y se vuelve a ver desde Ajustes. Hecho a mano, sin librerías, para no sumar peso en el cliente ni relajar la CSP.
- **Login por bootstrap** · Las variables `BOOTSTRAP_*` se recortan (espacios, saltos de línea, comillas) y, si el bootstrap no entra, se loguea el motivo sin valores.
