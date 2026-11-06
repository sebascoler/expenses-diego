# PRD — Expenses Diego

**Herramienta web para preparar la rendición mensual de gastos de Diego Castagnasso**

| | |
|---|---|
| Versión | 1.0 (borrador para desarrollo) |
| Fecha | 06/11/2026 |
| Autor | Sebastián Coler |
| Usuario final | Diego Castagnasso (usuario único) |
| Hosting | Vercel |
| Base de datos | Neon Postgres, plan free (ver §9) |
| Próximo hito | Demo del MVP a Diego el **sábado 14/11/2026, 16:30 (hora de Diego)** |

---

## 1. Contexto y problema

Diego trabaja como consultor y factura todos los meses a la empresa. La factura tiene dos partes:

1. **Honorarios fijos.** No tienen complejidad: "la copio y punto".
2. **Gastos reembolsables.** Este es el problema. Diego viaja unas 3 semanas por mes (Concordia, Buenos Aires, Montevideo, Lima, Marruecos, España…) y paga en varias monedas (soles, pesos uruguayos, euros, dólares…).

Hoy el desglose de gastos lo arma a mano, en parte con ayuda de un chat de IA. Los problemas son estos:

- **Lleva tiempo y lo va postergando.** Hace 3 meses que no hace el desglose. Quiere hacerlo "cada vez más rápido" y, idealmente, que lo haga otro.
- **No quiere hacerlo en el avión ni el fin de semana.** "Vengo de tres semanas, quiero descansar." En vuelo la conexión es inestable y no puede entrar al banco.
- **Mezcla gastos personales y de empresa** en las mismas tarjetas: Wise lo usa para todo, y de BBVA tiene dos tarjetas (física y virtual) de la misma cuenta, pero no siempre usa la que corresponde.
- **Hay reglas que una IA genérica no sabe y que se pierden en cada sesión.** Por ejemplo, el recargo del 3% de BBVA, la tarifa por km o qué gastos de un viaje son personales.
- **Datos incompletos:** BBVA muestra los gastos recientes "sin consolidar" (todavía sin el recargo), y el resumen consolidado llega por mail recién al cierre.
- **Trabajo por viaje:** Diego rinde por viaje. A eso se suman los km de la camioneta (€0,35/km) con descuentos manuales por uso personal, y los peajes.

### Cita textual del objetivo
> "No quiero hacerlo más. Quiero que me presente, eh, una vez por… los 20, quiero que me presente los gastos. Que me diga si hace falta que tenga que ir a buscar algo — al banco no va a poder entrar — pero me puede dar un aviso y que le baje la información."

---

## 2. Objetivos

| # | Objetivo | Métrica de éxito |
|---|---|---|
| O1 | Reducir el tiempo de la rendición mensual | ≤ 15 min desde que sube los archivos hasta que tiene el PDF y el mail listos |
| O2 | Que la herramienta haga la primera clasificación | ≥ 80% de los gastos bien pre-clasificados (empresa o personal, y viaje) sin tocar nada |
| O3 | No perder ni duplicar gastos | 0 gastos facturados dos veces y 0 duplicados al re-subir archivos que se solapan |
| O4 | Que Diego no tenga que acordarse | Recordatorio automático el día 20 de cada mes, que indica qué archivos faltan |
| O5 | Proteger la información bancaria | Acceso con login, sin archivos crudos almacenados y datos mínimos enviados a la IA |
| O6 | Poder usarla desde el teléfono | Flujo completo usable en móvil con conexión lenta (por ejemplo, el wifi del avión) |

### No-objetivos (explícitos)
- **Entrar al banco** o conectarse por API a BBVA o Wise. Diego descarga los archivos y los sube.
- **Generar la factura** en sí. La herramienta entrega el *importe de gastos* y el desglose para sumarlos a la factura que Diego ya hace.
- Contabilidad, impuestos o multi-usuario.

---

## 3. Usuario y escenarios

**Persona:** Diego. Hace un uso avanzado de la IA (ChatGPT, Claude, Instinct) pero **no programa** ("no quiero que me diga font 26, 32"). Usa sobre todo el teléfono, tiene Telegram y viaja constantemente.

**Escenarios clave:**

1. **Rendición del mes (escenario principal).** El día 20 le llega un mail: "Es momento de rendir. Último movimiento de BBVA cargado: 30/10. Bajá el Excel desde el 30/10 hasta hoy." Diego baja el CSV de Wise y el Excel de BBVA, los sube, revisa el listado pre-clasificado, corrige lo que haga falta, carga los km del viaje y descarga el PDF, el Excel y el texto del mail.
2. **Atraso de varios meses.** Sube 3 meses de archivos de una vez, con solapamientos. La herramienta no duplica nada y le arma todos los viajes del período.
3. **Viaje mixto.** En España, el fin de semana el alquiler del auto y la nafta fueron personales; la semana siguiente (de trabajo) la nafta la pagó él y es de empresa. Los dos gastos caen dentro de las fechas de "viajes" y la IA sugiere, pero Diego decide con un check.
4. **Gastos para terceros u oficina.** Compra 8 pasajes para el equipo. Son gastos de empresa, no van a ningún viaje propio y se agrupan en "Gastos generales / oficina".
5. **Km de la camioneta.** En un viaje hizo N km, de los que descuenta 200 por uso personal. Carga "km totales" y "km a descontar" y la herramienta calcula N−200 × €0,35.

---

## 4. Alcance por fases

### v1 (MVP, este PRD en detalle)
- Login de usuario único.
- Importación del **CSV de Wise** y del **Excel de BBVA** (uno o varios archivos a la vez).
- Parseo y normalización, **detección de duplicados** y reconciliación de pendientes y consolidados de BBVA.
- **Clasificación híbrida:** primero reglas deterministas, después sugerencia de la IA (Claude) con datos minimizados.
- **Pantalla de revisión:** check *aplica / no aplica*, selector de viaje, categoría, toggle del 3% y nota.
- **Viajes:** alta por rango de fechas, asignación automática por fecha, **km** (totales − descuento) × tarifa y **peajes** manuales por viaje.
- **Rendición (informe):** PDF de resumen, Excel/CSV, borrador del mail, importe para la factura, y marcado de los gastos como *rendidos*.
- Montos en **moneda original + EUR**.
- **Recordatorio mensual por mail** (por defecto el día 20), con el estado de las fuentes.
- Aprendizaje simple: las correcciones de Diego generan reglas reutilizables.

### Fase 2 (documentada, no se construye en v1)
- **Bot de Telegram para notas en el momento.** Por ejemplo: "el gasto de ahora en tal lugar de tanta plata no lo consideres". La nota queda pendiente y, al importar, se cruza con la transacción por fecha, monto y lugar.
- **Lectura del resumen PDF de BBVA** (el consolidado que llega por mail), para tomar el recargo real en lugar de estimarlo.
- **2FA (TOTP)** en el login.
- Creación del borrador directamente en Gmail, con los adjuntos.

### Fase 3
- **Integración con Gmail** para detectar pasajes y reservas, proponer viajes automáticamente y adjuntar comprobantes.
- Detección de km a partir de datos externos (hoy no hay fuente confiable: Diego no tiene los viajes en el calendario).

---

## 5. Requisitos funcionales (v1)

### 5.1 Autenticación y acceso
| ID | Requisito |
|---|---|
| RF-01 | Login con usuario y contraseña. **No hay registro público.** El único usuario se crea por script (`pnpm user:create`). |
| RF-02 | Contraseña hasheada con **Argon2id**. Sesión en una cookie `HttpOnly`, `Secure` y `SameSite=Lax`, con expiración de 7 días (renovable) y revocable desde la base. |
| RF-03 | Rate limiting del login: tras 5 intentos fallidos en 15 minutos, bloqueo de 15 minutos. Los intentos quedan registrados en `login_attempts`. |
| RF-04 | Cambio de contraseña desde Ajustes, pidiendo la contraseña actual. Al cambiarla se invalidan las demás sesiones. |
| RF-05 | **Entrega a Diego:** Sebastián prueba en vivo con datos reales o de prueba y después se ejecuta `pnpm db:reset`, que borra todos los datos. Luego `pnpm user:create` crea a Diego con una contraseña temporal, que se le entrega por un canal seguro. Recomendado: usar una branch de Neon para las pruebas (§9.3). Alternativa sin consola: bootstrap por variables de entorno y el botón "Borrar todos los datos" (§16.9). |

### 5.2 Importación de archivos
| ID | Requisito |
|---|---|
| RF-10 | Pantalla "Importar" con drag & drop o selector (usable en móvil). Acepta **varios archivos** en una carga. |
| RF-11 | Detección automática de la fuente por las columnas del archivo: **Wise CSV** o **BBVA Excel (.xlsx/.xls)**. Si no la reconoce, pide elegirla y muestra un error claro. |
| RF-12 | Límite de 5 MB por archivo y validación de la extensión y del contenido real (no solo del MIME). |
| RF-13 | **Los archivos crudos no se guardan.** Se parsean en memoria en el servidor y se descartan. Solo se guarda: hash SHA-256 del archivo, fuente, rango de fechas cubierto, filas leídas, nuevas, duplicadas y descartadas, y la fecha de importación. |
| RF-14 | Si se sube un archivo con el mismo hash, se avisa ("Este archivo ya fue importado el …") y no se reprocesa. |
| RF-15 | Resumen post-importación: "Se leyeron 142 movimientos: 97 nuevos, 38 duplicados ignorados, 7 no son gastos (transferencias o conversiones)". El botón principal lleva a la Revisión. |
| RF-16 | **Mapeo manual de columnas (fallback obligatorio):** si el archivo no se reconoce, se muestra una pantalla con los encabezados y las 5 primeras filas. Ahí el usuario elige qué columna es fecha, descripción, monto (o débito y crédito), moneda, tarjeta, estado y fee, y a qué fuente corresponde. El mapeo se guarda como **perfil de importación** (`import_profiles`) asociado a la firma de los encabezados, y la próxima vez se aplica solo. Esto garantiza que la app funcione con los archivos reales aunque su formato no coincida con el supuesto. |
| RF-17 | Parseo tolerante: montos `1.234,56` / `1,234.56` / `(12,50)` / `-12.50`, o con columnas de débito y crédito separadas. Fechas en `dd/mm/aaaa`, `aaaa-mm-dd`, con hora, o como número serial de Excel. Se ignoran las filas vacías, los títulos y los totales al pie del Excel (se detecta la fila de encabezados buscando las columnas conocidas). Las filas que no se puedan parsear se listan en el resumen con su motivo; no se descartan en silencio. |

### 5.3 Parseo y normalización
Todas las fuentes se normalizan a un mismo modelo de **transacción** (§8).

**Wise (CSV)**
| ID | Requisito |
|---|---|
| RF-20 | Leer el extracto CSV de Wise (uno por balance o el extracto de todos los balances). Columnas habituales: ID, Date, Amount, Currency, Description, Merchant, Card Last Four Digits, Exchange From/To, Exchange Rate, Total fees, Exchange To Amount. **Hay que validar el mapeo con un archivo real anonimizado de Diego** (§13). |
| RF-21 | Los movimientos que **no son gastos** (recargas, conversiones entre balances, transferencias propias, intereses o rendimientos, cashback) se marcan automáticamente como `no_gasto` y quedan ocultos de la revisión, con un filtro para verlos. |
| RF-22 | Se guardan el monto original, la moneda, el tipo de cambio aplicado por Wise y el **fee** de Wise. Por defecto el fee se suma al monto reembolsable (configurable, §5.9). |

**BBVA (Excel)**
| ID | Requisito |
|---|---|
| RF-23 | Leer el Excel de movimientos de tarjeta de BBVA. Columnas a confirmar con un archivo real: fecha, concepto o comercio, monto, moneda, tarjeta y estado. |
| RF-24 | Distinguir los movimientos **pendientes (sin consolidar)** de los **consolidados**. Los pendientes se marcan con `estado = pendiente` y se muestran con un badge. |
| RF-25 | Guardar los **últimos 4 dígitos de la tarjeta** cuando estén disponibles, para distinguir la tarjeta **física** (pensada para lo personal) de la **virtual** (pensada para la empresa). Esto alimenta una regla de clasificación (§5.4). |
| RF-26 | **Recargo del 3% de BBVA:** a toda transacción BBVA marcada como *aplica* se le suma por defecto un 3% ("IVA" que cobra el banco). Hay un toggle por fila para quitarlo. El porcentaje se configura en Ajustes. El recargo se muestra en una columna aparte; nunca se mezcla con el monto original. |

**Duplicados y reconciliación**
| ID | Requisito |
|---|---|
| RF-27 | Cada transacción tiene una `dedup_key` = HMAC-SHA256 de (fuente, ID externo si existe; si no, fecha + monto + moneda + descripción normalizada + últimos 4 de la tarjeta). Las claves repetidas se ignoran. |
| RF-28 | **Pendiente → consolidado (BBVA):** cuando llega un movimiento consolidado que coincide con uno pendiente (mismo comercio normalizado, misma moneda, fecha ±3 días y monto ±5%), se **fusionan**: se conservan la clasificación y las notas de Diego y se actualizan el monto y el estado. Si la coincidencia es ambigua, se pide confirmación en la revisión. |
| RF-29 | Una transacción ya **rendida** (incluida en un informe cerrado) nunca se modifica ni se duplica por una re-importación. |

### 5.4 Clasificación (híbrida: reglas + IA)
Cada transacción de gasto recibe una propuesta con estos campos: **aplica** (empresa/personal), **viaje**, **categoría**, **confianza** (alta/media/baja) y **motivo** ("tarjeta virtual", "regla: Uber → empresa", "IA: combustible dentro del viaje Lima").

Orden de evaluación (la primera regla que decide, gana):
| ID | Requisito |
|---|---|
| RF-30 | **Reglas del usuario.** Son reglas explícitas o aprendidas: comercio o patrón → aplica/no aplica y categoría. Ejemplo: "Netflix → personal". |
| RF-31 | **Regla de tarjeta** (configurable): la tarjeta BBVA virtual sugiere *empresa* y la física sugiere *personal*, con confianza media, porque Diego no siempre usa la correcta. |
| RF-32 | **Asignación de viaje por fecha:** si la fecha cae dentro de un viaje, se propone ese viaje. Si cae fuera, se propone "Gastos generales". Si hay viajes solapados, se elige el más corto y se marca para revisar. |
| RF-33 | **IA (Claude API)** para lo que las reglas no resuelvan: sugiere si aplica y la categoría. Recibe **solo** comercio o descripción normalizada, monto, moneda, fecha, fuente, tipo de tarjeta (física/virtual) y viaje candidato (nombre y destino). **Nunca** recibe números de cuenta, IBAN, nombres de terceros ni referencias de pago. Respuesta en JSON validado con Zod. Se procesa en lotes de hasta 50 transacciones. |
| RF-34 | Si la IA falla o no está configurada, la herramienta **funciona igual**: las transacciones quedan como "sin clasificar" y van primero en la revisión. |
| RF-35 | **Aprendizaje:** cuando Diego corrige el mismo comercio en el mismo sentido 2 veces, se ofrece "¿Crear regla? Siempre marcar *Starbucks* como personal". Las reglas se ven y se editan en Ajustes. |

**Categorías iniciales** (editables): Pasajes aéreos · Alojamiento · Transporte local (taxi/Uber/bus) · Combustible · Alquiler de auto · Peajes · Comidas · Comunicaciones · Compras oficina/terceros · Otros.

### 5.5 Revisión de gastos
| ID | Requisito |
|---|---|
| RF-40 | Listado de transacciones del período con filtros: **Por revisar** (default) · Empresa · Personal · Por viaje · Fuente · Pendientes BBVA · Rendidos. |
| RF-41 | Por cada fila: fecha, comercio, monto original + moneda, monto EUR, fuente e ícono de la tarjeta, **check "Aplica"**, **selector de viaje** (precargado por fecha), selector de categoría, **toggle del 3%** (solo en BBVA), nota libre, badge de confianza y el motivo. |
| RF-42 | En móvil, cada transacción es una tarjeta: tap para marcar aplica o no aplica, y swipe o botones grandes. En escritorio, una tabla. |
| RF-43 | **Acciones masivas:** seleccionar varias y marcarlas como aplica, no aplica, asignar viaje o asignar categoría. Botón "Aceptar todas las de confianza alta". |
| RF-44 | **Autosave** de cada cambio, con guardado optimista y reintentos, para que funcione con conexión inestable. |
| RF-45 | Contador visible: "23 por revisar · 74 empresa · 41 personal · Total empresa: € 3.412,50". |
| RF-46 | Se puede **agregar un gasto manual** (pagado en efectivo o con otra tarjeta) con fecha, monto, moneda, comercio, viaje y categoría. Fuente = `manual`. |

### 5.6 Viajes, kilómetros y peajes
| ID | Requisito |
|---|---|
| RF-50 | CRUD de viajes con nombre ("Lima – Visita proveedores"), destino, **fecha desde** y **fecha hasta**, y notas. |
| RF-51 | Al crear o editar un viaje, se re-asignan automáticamente las transacciones del rango **que no fueron asignadas a mano**. |
| RF-52 | Existe un "viaje" fijo, **Gastos generales / oficina**, para los gastos de empresa fuera de viaje (por ejemplo, los pasajes comprados para el equipo). |
| RF-53 | **Kilómetros por viaje:** se cargan km totales y km a descontar (uso personal), con un motivo opcional ("200 km de ida y vuelta a lo de mamá"). Cálculo: `(km_totales − km_descuento) × tarifa_km`. Tarifa por defecto: **€0,35/km**, configurable. Se permite también una entrada de km "Generales" del período. |
| RF-54 | **Peajes por viaje:** carga manual de uno o varios importes (monto, moneda, fecha opcional y nota), o de un total del viaje. |
| RF-55 | Vista del viaje: gastos asignados, subtotales por categoría, km, peajes y **total del viaje** (en moneda original y EUR). |

### 5.7 Moneda y tipo de cambio
| ID | Requisito |
|---|---|
| RF-60 | Se muestra **siempre** el monto en la moneda original y su equivalente en **EUR**. Los totales consolidados van en EUR, con un desglose por moneda original. |
| RF-61 | El tipo de cambio sale de estas fuentes, en este orden: (1) el que trae el propio movimiento (el exchange rate de Wise, o el monto debitado en la moneda de la cuenta BBVA); (2) la tasa de referencia del **BCE** de la fecha, vía la API pública Frankfurter (sin key), aplicada a la moneda de la cuenta (USD/EUR, etc.); (3) **carga manual**, si la moneda no está cubierta (ARS, UYU, PEN y CLP no están en el BCE). |
| RF-62 | Cada transacción guarda el `fx_rate`, el `fx_source` (wise/bbva/ecb/manual) y la `fx_date`. Las tasas consultadas se cachean en la tabla `fx_rates`. |
| RF-63 | El informe indica la fuente del tipo de cambio de cada línea. |

### 5.8 Rendición (informe y entregables)
| ID | Requisito |
|---|---|
| RF-70 | "Nueva rendición": se elige el **rango de fechas** (por defecto, desde el fin de la última rendición hasta hoy). Puede abarcar varios meses (el caso del atraso). |
| RF-71 | **Vista previa** con el total general (EUR), los totales **por viaje** (gastos + km + peajes), los totales por categoría y el detalle línea por línea. Avisa si quedan transacciones "por revisar" o pendientes BBVA en el rango. |
| RF-72 | **PDF de resumen:** encabezado (Diego, período, fecha), tabla resumen por viaje, detalle por viaje (fecha, comercio, categoría, monto original, recargo, EUR, fuente del tipo de cambio), km y peajes, y total general. Formato A4, con estilo sobrio. |
| RF-73 | **Excel (.xlsx) y CSV:** una hoja de resumen y una hoja de detalle con todas las columnas. Hay que **sanitizar** las celdas que empiezan con `= + - @` (protección contra CSV/formula injection). |
| RF-74 | **Borrador de mail:** asunto y cuerpo generados (en español, tono profesional) con el período, el total y el desglose por viaje. El texto es editable, con botones "Copiar" y "Abrir en mi mail" (`mailto:` con asunto y cuerpo; los adjuntos se agregan a mano en v1). El destinatario se configura en Ajustes. |
| RF-75 | **Importe para la factura:** un número destacado, "Gastos a facturar: € X", con un botón para copiar, más una línea de desglose sugerida para pegar en la factura. |
| RF-76 | **Cerrar rendición:** marca todas las transacciones, km y peajes incluidos como `rendido` (con referencia a la rendición) y los bloquea para edición. La rendición se puede **reabrir** con confirmación, lo que los desbloquea. |
| RF-77 | Historial de rendiciones, con su total y un botón para volver a descargar el PDF y el Excel. Estos se **regeneran a partir de los datos**; no se guardan archivos. |

### 5.9 Recordatorio mensual
| ID | Requisito |
|---|---|
| RF-80 | Mail automático el **día 20 de cada mes** (configurable), a las 09:00 en la zona horaria de Diego (por defecto `America/Argentina/Buenos_Aires`). |
| RF-81 | Contenido: link a la app, la **fecha del último movimiento cargado por fuente** ("Wise: 02/11 · BBVA: 30/10"), y qué rango bajar de cada banco ("Bajá el Excel de BBVA desde el 30/10 hasta hoy"). También la cantidad de gastos sin rendir y su total estimado, y la cantidad de pendientes BBVA que conviene re-bajar porque ya se consolidaron. |
| RF-82 | Si a los 3 días no hubo importación, se manda un segundo aviso (activable o desactivable). |
| RF-83 | El mail **no incluye** detalle de transacciones ni montos individuales, solo cantidades y totales. |
| RF-84 | Se implementa con Vercel Cron (ejecución diaria) → endpoint protegido con `CRON_SECRET` → envío con Resend. |

### 5.10 Ajustes
Incluye: tarifa por km (€0,35), porcentaje de recargo BBVA (3%), sumar el fee de Wise sí/no, tarjetas BBVA (últimos 4 dígitos y física/virtual), categorías, reglas de clasificación, día y hora del recordatorio, email del recordatorio, email del destinatario de la rendición, zona horaria, nombre para informes, cambio de contraseña, **exportar todos mis datos** (JSON/CSV), **borrar todos los datos** (§16.9) y "enviar recordatorio de prueba".

---

## 6. Flujo principal (happy path)

```
Mail del día 20 ──► Login ──► Importar (Wise CSV + BBVA Excel)
                                 │
                                 ▼
                     Parseo + dedup + reconciliación
                                 │
                                 ▼
                 Clasificación: reglas ──► IA (lo que falte)
                                 │
                                 ▼
          Revisión (check aplica · viaje · categoría · 3%)
                                 │
                                 ▼
             Viajes: crear o ajustar fechas · km · peajes
                                 │
                                 ▼
     Rendición: preview ──► PDF · Excel · mail · importe ──► Cerrar
```

---

## 7. Pantallas

| Pantalla | Contenido principal |
|---|---|
| **Login** | Usuario y contraseña. Sin "registrarse" ni "olvidé mi contraseña" (el reseteo se hace por script). |
| **Inicio** | Estado por fuente (último movimiento cargado), "X por revisar", total sin rendir, viajes del período y CTA "Importar" o "Revisar" o "Rendir", según el estado. |
| **Importar** | Zona de carga, instrucciones cortas de cómo bajar cada archivo (Wise / BBVA) y el resultado de la importación. |
| **Revisión** | Listado con filtros y acciones masivas (§5.5). |
| **Viajes** | Lista y detalle de cada viaje, con km y peajes. |
| **Rendición** | Rango, preview, entregables y cierre. Historial. |
| **Ajustes** | §5.10. |

**UI:** en español rioplatense, **mobile-first** (PWA instalable), fechas `dd/mm/aaaa`, separador decimal con coma, páginas livianas y sin dependencias pesadas en el cliente. Diego no tiene que ver nunca código ni JSON.

---

## 8. Modelo de datos (Postgres)

```
users            id, username (unique), password_hash, created_at, password_changed_at
sessions         id, user_id, token_hash, expires_at, created_at, last_seen_at, revoked_at
login_attempts   id, username, ip_hash, success, created_at

import_profiles  id, source (wise|bbva), header_signature (unique), mapping (jsonb), created_at
imports          id, source (wise|bbva), file_sha256 (unique), date_from, date_to,
                 rows_read, rows_new, rows_dup, rows_ignored, created_at

trips            id, name, destination, date_from, date_to, notes, is_general (bool), created_at
trip_mileage     id, trip_id, km_total, km_deduction, deduction_reason, rate_eur, created_at
trip_tolls       id, trip_id, amount, currency, date, note

transactions     id, import_id (null si manual), source (wise|bbva|manual), external_id,
                 dedup_key (unique), date, merchant_normalized,
                 description_enc,            -- texto original, cifrado
                 amount, currency,           -- monto original (negativo = gasto)
                 fee_amount, fee_currency,   -- fee Wise
                 card_last4, card_type (fisica|virtual|null),
                 bank_status (pendiente|consolidado|null),
                 kind (gasto|no_gasto),
                 applies (true|false|null),  -- null = por revisar
                 trip_id, category_id, trip_assigned_manually (bool),
                 surcharge_pct, surcharge_enabled (bool),
                 fx_rate, fx_source, fx_date, amount_eur,
                 suggestion_source (regla|tarjeta|ia|null), suggestion_confidence, suggestion_reason,
                 note_enc,                   -- nota de Diego, cifrada
                 report_id (null = no rendido),
                 created_at, updated_at

categories       id, name, sort_order, active
rules            id, match_type (merchant_equals|merchant_contains|regex), pattern,
                 applies, category_id, created_from (manual|aprendida), hits, active
fx_rates         date, base, quote, rate, source        (PK date+base+quote)

reports          id, date_from, date_to, status (borrador|cerrado), total_eur,
                 email_subject, email_body, closed_at, created_at
settings         key, value (jsonb)
audit_log        id, action, entity, entity_id, meta (jsonb, sin datos sensibles), created_at
```

**Cálculo del monto reembolsable por línea (EUR):**
```
base      = |amount| (+ fee si "sumar fee Wise" está activo)
recargo   = base × surcharge_pct  (solo si surcharge_enabled, BBVA por defecto 3%)
total     = (base + recargo) × fx_rate → EUR
viaje     = Σ total líneas aplica=true + (km_total − km_deduction) × rate_eur + Σ peajes→EUR
rendición = Σ viajes del rango (incluye Gastos generales)
```
Se trabaja con decimales exactos (`numeric` en Postgres y `decimal.js` en TypeScript). Se redondea a 2 decimales solo al mostrar o al totalizar por línea.

---

## 9. Arquitectura técnica

### 9.1 Stack
| Capa | Elección | Por qué |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | Encaje nativo con Vercel: UI y API en un solo proyecto. |
| UI | Tailwind CSS + shadcn/ui, PWA | Rápido de construir, buen resultado en móvil. |
| Base de datos | **Neon Postgres (free)** | Ver §9.2. |
| ORM / validación | Drizzle ORM + driver serverless de Neon, Zod | Liviano, tipado y con migraciones versionadas. |
| Parseo | PapaParse (CSV) y SheetJS (`.xlsx`/`.xls`, instalado desde el tarball oficial de cdn.sheetjs.com) | Cubren los formatos de Wise y BBVA, incluido el `.xls` viejo. |
| Exportación | `@react-pdf/renderer` (PDF) y `exceljs` (xlsx) | Funcionan en funciones serverless. |
| IA | Anthropic SDK, modelo `claude-haiku-5-5` (clasificación por lotes; si hace falta más precisión, `claude-sonnet-5-5`) | Clasificación barata y rápida, con salida JSON estructurada. |
| Email | **Resend** (plan free) | API simple. Requiere un dominio verificado para mandar a terceros (§13). Alternativa: SMTP de Gmail con app password vía Nodemailer. |
| Cron | Vercel Cron (1 vez por día) | Alcanza para el recordatorio mensual dentro del plan Hobby. |
| Tipo de cambio | Frankfurter API (BCE, sin key) | Gratis y con datos históricos por fecha. |
| Tests | Vitest (parsers y cálculos) + Playwright (flujo principal) | |

### 9.2 Recomendación de base de datos: **Neon Postgres**
| Opción | Ventajas | Desventajas |
|---|---|---|
| **Neon (elegida)** | Postgres real, integración nativa en el Marketplace de Vercel (las variables de entorno se inyectan solas), **branching** de base (ideal para probar y entregar limpio), cifrado en reposo, TLS y plan free suficiente para un solo usuario | La base se suspende cuando no se usa: el primer request tiene un "cold start" de ~1 s |
| Turso (SQLite) | Free generoso, muy rápido | Menos estándar para reportes y tipos `numeric` |
| MongoDB Atlas (M0) | Free | El modelo relacional (viajes, rendiciones, reglas) encaja peor |

Volumen estimado: unos cientos de transacciones por mes, es decir, pocos MB por año. Queda muy por debajo de los límites del plan free de Neon (hay que verificar los límites vigentes al darlo de alta).

### 9.3 Entornos y entrega
- **Branch `dev` de Neon** → para las pruebas de Sebastián, conectada a los previews de Vercel.
- **Branch `main` de Neon** → producción de Diego, que arranca vacía.
- Scripts: `pnpm db:migrate`, `pnpm db:reset` (borra todos los datos; pide confirmación escribiendo el nombre de la base), `pnpm user:create`, `pnpm user:reset-password`.
- Checklist de entrega: (1) correr las migraciones en `main`, (2) `db:reset` si se probó en `main`, (3) `user:create diego`, (4) rotar `SESSION_SECRET`, `ENCRYPTION_KEY` y `CRON_SECRET` si se compartieron, (5) disparar el cron a mano y verificar que llega el mail, (6) entregar la contraseña temporal a Diego por un canal seguro y pedirle que la cambie.

### 9.4 Variables de entorno (todas en Vercel, ninguna en el repo)
`DATABASE_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY` (32 bytes, base64), `DEDUP_HMAC_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `CRON_SECRET`, `APP_URL`.

### 9.5 Restricciones de Vercel Hobby
- El plan Hobby es para uso personal y no comercial. Esta herramienta es personal, pero conviene confirmarlo; si no, habría que pasar a Pro.
- Cron con frecuencia máxima diaria (suficiente).
- Las funciones tienen un tiempo máximo de ejecución. El parseo tarda poco, y la clasificación con IA se hace en lotes y en paralelo, con reintentos. Si un lote falla, las transacciones quedan como "sin clasificar" y no se bloquea nada.

---

## 10. Seguridad y privacidad

| Área | Medida |
|---|---|
| Acceso | Usuario único, sin registro, Argon2id, rate limiting, cookies seguras y sesiones revocables. Todas las rutas y APIs exigen sesión, salvo `/login` y el endpoint del cron (que exige `CRON_SECRET`). |
| Archivos | **No se almacenan.** Se procesan en memoria y solo se guarda el hash. Tamaño limitado y validación del contenido. |
| Datos en reposo | Neon cifra en reposo. Además, la **descripción original y las notas** se cifran a nivel de aplicación con AES-256-GCM (`ENCRYPTION_KEY`). Los montos y fechas quedan en claro para poder calcular. |
| Datos en tránsito | HTTPS (Vercel) y TLS hacia Neon, Anthropic y Resend. |
| IA | Minimización (RF-33). Sin números de cuenta, IBAN, nombres de terceros ni referencias de pago. Según los términos de Anthropic, los datos de la API no se usan para entrenar. No se mandan archivos completos. |
| Email | El recordatorio solo lleva cantidades y totales; nunca el detalle. |
| Exportaciones | Sanitización contra formula injection en CSV y Excel. |
| Logs | Sin datos de transacciones ni PII en los logs. El `audit_log` guarda acciones (importó, cerró la rendición…) con metadatos no sensibles. |
| Headers | CSP estricta, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, HSTS y `noindex` (robots). |
| Dependencias | Dependabot, versiones fijadas y `pnpm audit` en CI. |
| Secretos | Solo en las variables de entorno de Vercel. `.env*` en `.gitignore`. Rotación en la entrega (§9.3). |
| Datos de prueba | Los archivos de ejemplo del repo (fixtures) están **anonimizados**. Nunca se commitean extractos reales. |
| Portabilidad | Botón para exportar todos los datos, y `db:reset` para borrarlos. |

---

## 11. Requisitos no funcionales

- **Rendimiento:** importar 500 filas y clasificarlas en < 30 s. Cada pantalla tiene que cargar en < 2 s con 3G.
- **Resiliencia:** autosave con reintentos, y la app tiene que seguir funcionando sin IA.
- **Exactitud:** los cálculos usan decimales exactos y tienen tests unitarios (recargo, fee, km, tipo de cambio, totales).
- **Idioma y formato:** español, `dd/mm/aaaa`, coma decimal y símbolo de moneda.
- **Accesibilidad:** objetivos táctiles de ≥ 44 px y contraste AA.
- **Costo:** USD 0 de infraestructura (Vercel Hobby, Neon free, Resend free). El único costo variable es la API de Claude, que con este volumen debería quedar en centavos por mes.

---

## 12. Plan de desarrollo (etapas)

| Etapa | Entregable | Criterio de aceptación |
|---|---|---|
| **0. Setup** | Repo Next.js, proyecto Vercel, Neon (branches `dev` y `main`), Drizzle, CI (lint + tests) | Deploy de preview funcionando y conectado a la branch `dev`. |
| **1. Auth** | Login, sesiones, rate limiting y scripts de usuario y reset | No se puede acceder a ninguna ruta sin sesión, y tras 5 intentos fallidos hay bloqueo. |
| **2. Importación** | Parsers de Wise y BBVA, dedup, reconciliación de pendientes y no-gastos | Con los fixtures reales anonimizados: se reconocen todas las filas, y re-subir el mismo archivo da 0 nuevas. |
| **3. Revisión + reglas** | Listado, check, categoría, toggle del 3%, acciones masivas, autosave, reglas de tarjeta y de usuario | Se puede clasificar un mes completo desde el móvil. |
| **4. Viajes + km + peajes** | CRUD de viajes, auto-asignación por fecha, km y peajes | Al crear un viaje se asignan los gastos del rango, y el total del viaje coincide con un cálculo hecho a mano. |
| **5. Moneda** | Tipo de cambio de la fuente, del BCE o manual, y cache | Cada línea tiene monto en EUR y fuente del tipo de cambio. |
| **6. Rendición** | Preview, PDF, Excel/CSV, mail, importe, cierre y reapertura | Los entregables cuadran con la preview, y lo rendido no se puede volver a rendir. |
| **7. IA** | Clasificación con Claude, con datos minimizados y sugerencia de reglas | ≥ 80% de acierto sobre un mes real revisado por Diego. Sin `ANTHROPIC_API_KEY`, todo sigue funcionando. |
| **8. Recordatorio** | Cron + Resend + segundo aviso | El mail llega el día configurado con el estado correcto de cada fuente. |
| **9. Entrega** | Checklist §9.3 y una mini guía para Diego (cómo bajar los archivos de Wise y BBVA) | Diego hace su primera rendición real. |

**Para la prueba del 14/11:** la webapp tiene que estar **deployada en Vercel con todas las etapas 0–8**. Prioridad si falta tiempo: P0 = etapas 0–6 (importar → revisar → viajes → rendición con PDF, Excel y mail). P1 = etapa 7 (IA) y etapa 8 (recordatorio). La definición exacta de "listo" está en §16.1.

---

## 13. Supuestos y preguntas abiertas (a cerrar con Diego el 14/11)

**Archivos de muestra (bloqueante para la etapa 2):**
1. ¿Puede pasar **un CSV de Wise y un Excel de BBVA reales**? Los anonimizamos antes de commitearlos como fixtures.

**Bancos:**
2. ¿BBVA es de **Uruguay**? ¿En qué moneda está la cuenta (USD/UYU)? ¿El Excel trae la columna de tarjeta y el estado pendiente/consolidado?
3. El **3%**: ¿se aplica a todos los gastos de BBVA o solo a los que son en moneda extranjera o en el exterior? (Por defecto se aplica a todos, con un toggle por fila.)
4. ¿Cuáles son los últimos 4 dígitos de la tarjeta **física** y de la **virtual**?
5. **Wise:** ¿qué balances usa (EUR, USD…)? ¿El fee de conversión se le rinde a la empresa? (Por defecto sí.)

**Empresa:**
6. ¿La empresa pide los gastos **en EUR**? ¿Exige un formato, categorías o comprobantes adjuntos?
7. ¿A qué email va la rendición? ¿Desde qué casilla se manda el recordatorio? (Resend necesita un dominio verificado; si no, se usa Gmail SMTP.)
8. ¿Los km y los peajes van en el mismo informe mensual, o los peajes se siguen rindiendo una vez por año?

**Uso:**
9. ¿El **período** de rendición es del 20 al 20, por mes calendario o libre? (Por defecto es libre, desde la última rendición.)
10. ¿Quiere que los gastos **personales** se puedan ver (para su control) o que se oculten?

**Supuestos tomados en este PRD:** usuario único sin 2FA en v1 · reporte en moneda original + EUR · los archivos no se guardan · IA híbrida con datos minimizados · los peajes se cargan por viaje · el recordatorio es el día 20.

> **Para los agentes de desarrollo:** ninguna de estas preguntas bloquea la construcción. Cada una tiene un default en §16.2 y todo lo que dependa de ellas queda **configurable en Ajustes**, así Diego lo ajusta sin tocar código.

---

## 14. Riesgos

| Riesgo | Mitigación |
|---|---|
| Wise o BBVA cambian el formato de exportación | Parsers con mapeo de columnas por nombre y tests con fixtures. Ante un formato desconocido, error claro y no una importación parcial silenciosa. |
| Falsos duplicados o gastos que se pierden en la reconciliación | Coincidencias ambiguas → confirmación manual. Resumen de importación visible. |
| La IA clasifica mal | Siempre es una sugerencia con su motivo, la decisión final es de Diego, y las reglas aprendidas reducen errores con el tiempo. |
| Monedas sin tasa del BCE (ARS, UYU, PEN) | Se prioriza la tasa que trae la fuente, con carga manual como fallback. |
| Diego no baja los archivos | Recordatorio con instrucciones concretas, segundo aviso y uso posible desde el teléfono. |
| Dependencia de los planes free | El volumen es mínimo. Exportación de datos disponible, y la migración a Pro o a otro Postgres es trivial. |

---

## 15. Glosario
- **Rendición:** conjunto de gastos, km y peajes de un período que se presenta a la empresa junto con la factura.
- **Aplica:** el gasto es reembolsable por la empresa.
- **Pendiente (BBVA):** movimiento de tarjeta todavía no consolidado. Su monto final puede cambiar (recargo).
- **Gastos generales / oficina:** gastos de empresa que no pertenecen a un viaje propio.

---

## 16. Guía de implementación para agentes

Esta sección es el **contrato operativo** para construir la webapp en una conversación nueva. Si algo no está definido acá ni en §1–15, elegí la opción más simple que cumpla los requisitos de seguridad (§10), documentala en `docs/DECISIONS.md` y seguí adelante. **No te frenes a preguntar.**

### 16.1 Definición de "listo" para la prueba del 14/11
1. La app está **deployada en Vercel**, con una URL de producción, conectada a Neon (branch `main`), y con las migraciones aplicadas.
2. El login funciona con el usuario creado por bootstrap (§16.9) o por script.
3. Con los **fixtures sintéticos** de `fixtures/` se puede completar el flujo entero: importar Wise y BBVA → revisar → crear viaje → cargar km y peajes → generar la rendición → descargar el PDF, el Excel y el CSV → copiar el mail y el importe → cerrar la rendición.
4. Con un archivo **real** de formato desconocido se puede importar usando el mapeo manual de columnas (RF-16).
5. `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm test:e2e` pasan en verde.
6. Sin `ANTHROPIC_API_KEY` y sin `RESEND_API_KEY` la app funciona igual (degradación elegante, §16.5).
7. En Ajustes, el botón "Borrar todos los datos" deja la base lista para entregarla a Diego (§16.9).

### 16.2 Decisiones por defecto (resuelven las preguntas abiertas de §13)
| Tema | Default |
|---|---|
| Moneda de reporte | EUR, mostrando también la moneda original |
| Recargo BBVA | 3% a toda transacción BBVA con `applies=true`, con toggle por fila (configurable) |
| Fee de Wise | Se suma al monto reembolsable (configurable) |
| Tarjetas BBVA | Sin configurar al inicio. Si no hay últimos 4 dígitos cargados, la regla de tarjeta no se aplica |
| Período de rendición | Libre: por defecto, desde el fin de la última rendición (o el primer movimiento) hasta hoy |
| Gastos personales | Se ven en la revisión (filtro "Personal") y nunca aparecen en los entregables |
| Peajes | Se cargan por viaje y entran en la rendición mensual |
| Destinatario del mail | Vacío. El `mailto:` se abre sin destinatario hasta que se configure |
| Zona horaria | `America/Argentina/Buenos_Aires` |
| Recordatorio | Día 20, a las 09:00 locales, con segundo aviso a los 3 días activado |
| Categorías | Las de §5.4 |
| Nombre en el PDF | "Diego Castagnasso" (configurable en Ajustes → "Nombre para informes") |

### 16.3 Estructura del repo
```
app/
  (auth)/login/page.tsx
  (app)/layout.tsx                 # exige sesión válida (verificación en el servidor) + navegación inferior en móvil
  (app)/page.tsx                   # Inicio
  (app)/importar/page.tsx          # + paso de mapeo de columnas
  (app)/revision/page.tsx
  (app)/viajes/page.tsx  (app)/viajes/[id]/page.tsx
  (app)/rendiciones/page.tsx  (app)/rendiciones/nueva/page.tsx  (app)/rendiciones/[id]/page.tsx
  (app)/ajustes/page.tsx
  api/import/route.ts              # POST multipart → pipeline de importación
  api/reports/[id]/pdf/route.ts    # GET, genera al vuelo
  api/reports/[id]/xlsx/route.ts
  api/reports/[id]/csv/route.ts
  api/export/route.ts              # export de todos los datos (JSON)
  api/cron/reminder/route.ts       # Vercel Cron, exige Authorization: Bearer CRON_SECRET
lib/
  db/schema.ts  db/client.ts       # Drizzle. Neon en prod, PGlite en tests y dev sin DATABASE_URL
  auth/password.ts  auth/session.ts  auth/rate-limit.ts  auth/bootstrap.ts
  crypto.ts                        # AES-256-GCM (encrypt/decrypt) + HMAC (dedup_key)
  parsers/detect.ts  parsers/wise.ts  parsers/bbva.ts  parsers/column-map.ts
  parsers/amount.ts  parsers/date.ts  parsers/merchant.ts   # normalización
  import/pipeline.ts  import/dedup.ts  import/reconcile.ts
  classify/pipeline.ts  classify/rules.ts  classify/card.ts  classify/trips.ts  classify/ai.ts
  fx/index.ts  fx/frankfurter.ts
  calc/money.ts  calc/totals.ts    # decimal.js, una sola fuente de verdad para los cálculos
  reports/build.ts  reports/pdf.tsx  reports/xlsx.ts  reports/csv.ts  reports/email-draft.ts
  mail/send.ts  mail/reminder.ts   # Resend, o fallback a consola
middleware.ts                      # redirige a /login si no hay cookie (la validación real es en el servidor)
scripts/user-create.ts  scripts/user-reset-password.ts  scripts/db-reset.ts  scripts/seed-demo.ts
fixtures/generate.ts  fixtures/wise-sample.csv  fixtures/bbva-sample.xlsx  fixtures/bbva-overlap.xlsx
tests/unit/**  tests/e2e/**
docs/PRD.md  docs/DECISIONS.md
vercel.json  .env.example  drizzle.config.ts
```
Las mutaciones de la UI se hacen con **Server Actions**, validadas con Zod y verificando la sesión. Los route handlers se usan solo para la subida de archivos, las descargas, el export y el cron.

### 16.4 Scripts de `package.json`
`dev`, `build`, `vercel-build` (`db:migrate && next build`), `lint`, `typecheck`, `test` (Vitest), `test:e2e` (Playwright), `db:generate`, `db:migrate`, `db:reset`, `db:seed:demo`, `fixtures:generate`, `user:create`, `user:reset-password`. Gestor de paquetes: **pnpm**.

### 16.5 Desarrollo y tests sin servicios externos
- **Base de datos:** si `DATABASE_URL` no está definida (en dev o tests), se usa **PGlite** (`@electric-sql/pglite`, driver de Drizzle) en memoria o en `.pglite/`. Las migraciones son las mismas que para Neon.
- **IA:** sin `ANTHROPIC_API_KEY` se salta el paso de IA y las transacciones quedan como "sin clasificar". En los tests, `classify/ai.ts` se mockea.
- **Mail:** sin `RESEND_API_KEY`, `mail/send.ts` loguea el asunto y la cantidad de destinatarios (no el contenido) y Ajustes muestra "Mail no configurado". En Ajustes hay un botón "Enviar recordatorio de prueba".
- **Tipo de cambio:** en los tests, Frankfurter se mockea con fixtures. En runtime, si falla, la línea queda con `fx_source = pendiente` y se pide carga manual (la rendición no se puede cerrar con líneas sin tipo de cambio).

### 16.6 Fixtures sintéticos (no hay archivos reales todavía)
`fixtures/generate.ts` genera los datos de forma determinista (con seed fija), con comercios y nombres **ficticios**:
- **`wise-sample.csv`** (~60 filas, rango 01/08–10/11) con los encabezados públicos del extracto CSV de Wise: `TransferWise ID, Date, Amount, Currency, Description, Payment Reference, Running Balance, Exchange From, Exchange To, Exchange Rate, Payer Name, Payee Name, Payee Account Number, Merchant, Card Last Four Digits, Card Holder Full Name, Attachment, Note, Total fees, Exchange To Amount`. Tiene que incluir:
  - pagos con tarjeta en EUR, y en PEN y UYU con conversión y fee;
  - recargas, conversiones entre balances y transferencias propias (`no_gasto`);
  - cashback o intereses;
  - un Uber, combustible y hoteles dentro de las fechas de un viaje;
  - gastos personales evidentes (supermercado y streaming).
- **`bbva-sample.xlsx`** (~40 filas, rango 01/08–31/10), con una fila de título y una fila de totales al pie (para probar RF-17). Encabezados supuestos: `Fecha, Descripción, Tarjeta, Moneda, Importe, Estado`. Incluye la tarjeta física (`****1111`) y la virtual (`****2222`), montos en USD y UYU, y varios movimientos `Pendiente`.
- **`bbva-overlap.xlsx`**: rango 15/10–10/11. Repite 10 movimientos del archivo anterior (para probar el dedup) y trae como `Consolidado` 3 movimientos que en el anterior eran `Pendiente` (para probar la reconciliación, RF-28).
- **`bbva-unknown.xlsx`**: los mismos datos con encabezados distintos (`F. Operación, Concepto, Débito, Crédito, Div.`) para probar el mapeo manual (RF-16).

`scripts/seed-demo.ts` carga los fixtures y crea 2 viajes de ejemplo ("Lima – Proveedores", 10/09–18/09; "España – Feria", 03/10–12/10), para la demo. **Nunca** se commitean datos reales de Diego.

### 16.7 Contrato con la IA (`classify/ai.ts`)
- Modelo `claude-haiku-5-5`, configurable con `ANTHROPIC_MODEL`. Temperatura 0 y lotes de hasta 50 transacciones.
- La salida es **estructurada** (tool use con JSON schema), validada con Zod. Los ítems inválidos se ignoran y quedan como "sin clasificar".
- **Entrada:** `{ id, fecha, comercio, monto, moneda, fuente, tipo_tarjeta, viaje_candidato: {nombre, destino} | null }`. El `id` es un índice local del lote, no el UUID de la base.
- **Contexto:** la lista de categorías; los viajes del período (nombre, destino y fechas); un texto de reglas de negocio ("Diego es consultor y rinde a la empresa los gastos de viajes de trabajo: pasajes, hoteles, transporte, combustible, comidas en viaje. Supermercado, streaming, ropa y ocio son personales. Los fines de semana dentro de un viaje pueden ser personales"); y hasta 20 decisiones recientes de Diego (solo comercio → aplica y categoría).
- **Salida:** `[{ id, applies: boolean | null, category: <categoría> | null, confidence: "alta" | "media" | "baja", reason: string (≤ 80 caracteres, en español) }]`.
- La IA **nunca** decide sobre filas que ya tienen `applies` puesto por Diego, ni sobre filas rendidas.

### 16.8 Variables de entorno (`.env.example`)
```
DATABASE_URL=            # Neon (la inyecta la integración de Vercel). Vacío = PGlite local
SESSION_SECRET=          # openssl rand -base64 32
ENCRYPTION_KEY=          # openssl rand -base64 32  (AES-256-GCM)
DEDUP_HMAC_KEY=          # openssl rand -base64 32
BOOTSTRAP_USERNAME=      # opcional, ver §16.9
BOOTSTRAP_PASSWORD=      # opcional, ver §16.9 (mínimo 12 caracteres)
ANTHROPIC_API_KEY=       # opcional
ANTHROPIC_MODEL=claude-haiku-5-5
RESEND_API_KEY=          # opcional
MAIL_FROM=               # ej. "Gastos <gastos@tudominio.com>"
CRON_SECRET=             # openssl rand -base64 32
APP_URL=                 # https://<proyecto>.vercel.app
```
Si al arrancar faltan `SESSION_SECRET`, `ENCRYPTION_KEY` o `DEDUP_HMAC_KEY` en producción, la app **falla rápido**, con un mensaje claro en los logs.

### 16.9 Deploy en Vercel, bootstrap del usuario y entrega
**Pasos que hace Sebastián (una vez):**
1. Vercel → Add New Project → importar `sebascoler/expenses-diego`.
2. Storage → agregar **Neon** desde el Marketplace. Esto crea la base e inyecta `DATABASE_URL`. Hay que crear una branch `dev` para los previews.
3. Cargar las variables de §16.8 en Production (y Preview).
4. Deploy. `vercel-build` aplica las migraciones.
5. `vercel.json` define el cron: `{ "crons": [{ "path": "/api/cron/reminder", "schedule": "0 12 * * *" }] }`. Vercel manda `Authorization: Bearer $CRON_SECRET`. El endpoint decide si ese día corresponde mandar el mail según el día configurado y la zona horaria.

**Bootstrap del usuario (sin consola):** si la tabla `users` está **vacía** y existen `BOOTSTRAP_USERNAME` y `BOOTSTRAP_PASSWORD`, el primer login con esas credenciales crea el usuario (hash Argon2id), lo registra en `audit_log` y desde ese momento el bootstrap queda inactivo aunque las variables sigan definidas. Después de usarlo se recomienda borrar `BOOTSTRAP_PASSWORD` de Vercel.

**Prueba en vivo → entrega a Diego:**
1. Sebastián prueba con su usuario bootstrap.
2. Ajustes → **"Borrar todos los datos"**, que pide la contraseña y escribir `BORRAR`. Esto elimina transacciones, importaciones, perfiles de importación, viajes, km, peajes, rendiciones, reglas aprendidas, tasas cacheadas, sesiones **y el usuario**, y restaura los ajustes por defecto. Queda registrado en `audit_log`.
3. Cambiar `BOOTSTRAP_USERNAME` y `BOOTSTRAP_PASSWORD` en Vercel por los de Diego, y rotar `SESSION_SECRET` y `CRON_SECRET`. No se rota `ENCRYPTION_KEY` porque ya no quedan datos cifrados, aunque se puede hacer. Después, redeploy.
4. Diego entra con sus credenciales y cambia la contraseña desde Ajustes.
- Alternativa por CLI: `pnpm db:reset` y `pnpm user:create`, con `DATABASE_URL` apuntando a producción.

### 16.10 Tests de aceptación mínimos
**Unitarios (Vitest):**
- Parseo de montos y fechas en todos los formatos de RF-17.
- Detección de fuente y de la fila de encabezados.
- Los fixtures de Wise y BBVA importan exactamente las filas esperadas: N gastos, M `no_gasto`.
- Re-importar el mismo archivo da 0 nuevas. `bbva-overlap` da 10 duplicados y 3 reconciliados.
- Un perfil de mapeo guardado se aplica en la segunda importación.
- Cálculos con valores fijos: recargo del 3%, fee de Wise, km `(1250 − 200) × 0,35 = € 367,50`, peajes en otra moneda, total del viaje y total de la rendición.
- Cifrado y descifrado con AES-GCM, y HMAC estable.
- Rate limit del login.
- Un CSV exportado con `=SUM(1)` en una descripción sale sanitizado.
- Las transacciones rendidas no se modifican al re-importar.

**E2E (Playwright, viewport móvil y desktop):**
1. Login → importar los 2 fixtures → revisar (aceptar las de confianza alta, marcar 2 como personal) → crear viaje → cargar km y peaje → nueva rendición → descargar el PDF (status 200, `application/pdf`) y el Excel → copiar el importe → cerrar → verificar que esos gastos aparecen como "Rendido".
2. Acceder a `/revision` sin sesión redirige a `/login`.
3. Importar `bbva-unknown.xlsx` → mapeo manual → la importación es correcta.

### 16.11 Orden de trabajo y paralelización sugerida
1. **Base (secuencial):** setup, schema completo de §8, auth y bootstrap, layout con navegación, y CI.
2. **En paralelo**, una vez fijado el schema:
   - (a) fixtures, parsers, pipeline de importación y mapeo manual;
   - (b) cálculos y FX;
   - (c) revisión, reglas y viajes (UI);
   - (d) rendición y entregables;
   - (e) IA;
   - (f) recordatorio y Ajustes.
3. **Integración:** seed demo, E2E, deploy y checklist de §16.1.

### 16.12 Convenciones
- TypeScript `strict`. Los módulos de servidor llevan `import "server-only"`. Ningún secreto en el bundle del cliente.
- Dinero: `numeric(14,4)` en la base y `Decimal` en el código; nunca `number` para sumar. Fechas de transacción: tipo `date`, sin zona horaria.
- Validación con Zod en todo input (Server Actions, uploads y respuesta de la IA).
- Textos de la UI en español rioplatense, centralizados en `lib/i18n/es.ts`.
- Antes de cada cambio de UI, verificar que funcione en un viewport de 390 px de ancho.
- Commits chicos y descriptivos. Las decisiones no triviales se registran en `docs/DECISIONS.md`.
