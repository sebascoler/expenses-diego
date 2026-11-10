# Manual: tu propia copia de la app de gastos

Este manual es para vos, Diego. Al terminarlo vas a tener **tu propia app de gastos**: el código en tu cuenta de GitHub, la app publicada en tu cuenta de Vercel y los datos en tu propia base. No depende de nadie más y la podés cambiar cuando quieras (por ejemplo, pidiéndoselo a Claude).

No hace falta saber programar. Hay que crear algunas cuentas, copiar y pegar unos datos y tocar algunos botones.

- **Tiempo:** entre 45 y 60 minutos la primera vez.
- **Desde dónde:** desde una computadora. Después la app se usa desde el teléfono.
- **Costo:** $0 en GitHub, Vercel, Neon y Resend (planes gratis). La IA (opcional) se paga por uso: con unos cientos de gastos por mes son centavos de dólar.

> Las pantallas de estos servicios cambian seguido. Si un botón no se llama exactamente igual, buscá el más parecido. Si te trabás, mandale una captura a Claude y preguntale qué tocar.

---

## Antes de empezar

Tené a mano:

1. **Tu mail** (conviene usar siempre el mismo en todas las cuentas).
2. **Un lugar seguro para anotar claves.** Lo ideal es un gestor de contraseñas (1Password, Bitwarden, el llavero de Apple o el de Google). Vas a generar 4 claves secretas y una contraseña. **No las mandes por WhatsApp, mail ni las pegues en un chat.**

Resumen de lo que vas a hacer:

| Paso | Qué | Obligatorio |
|---|---|---|
| 1 | Crear tu cuenta de GitHub (donde vive el código) | Sí |
| 2 | Copiar el proyecto a tu GitHub | Sí |
| 3 | Crear tu cuenta de Vercel (donde se publica la app) | Sí |
| 4 | Generar las claves secretas | Sí |
| 5 | Crear el proyecto en Vercel | Sí |
| 6 | Agregar la base de datos (Neon) | Sí |
| 7 | Publicar y anotar la dirección de tu app | Sí |
| 8 | Entrar por primera vez | Sí |
| 9 | Configurar tus datos en Ajustes | Sí |
| 10 | Activar la IA (Claude) | Opcional, recomendado |
| 11 | Activar el mail del recordatorio (Resend) | Opcional, recomendado |
| 12 | Cambiar la app con Claude Code | Cuando quieras |

---

## Paso 1 — Crear tu cuenta de GitHub

GitHub es donde se guarda el código de la app.

1. Entrá a <https://github.com/signup> y creá una cuenta con tu mail.
2. Elegí un nombre de usuario (por ejemplo, `diegocastagnasso`). Lo vas a usar en los próximos pasos.
3. Recomendado: activá la verificación en dos pasos (tu foto de perfil → **Settings** → **Password and authentication** → **Two-factor authentication**).

Si ya tenés cuenta, saltá al paso 2.

## Paso 2 — Copiar el proyecto a tu GitHub

Vas a hacer una copia **independiente y privada** del proyecto. No uses el botón "Fork": un fork de un proyecto público queda público y atado al original.

1. Entrá a <https://github.com/new/import>.
2. Completá:
   - **The URL for your source repository:** `https://github.com/sebascoler/expenses-diego`
   - Los campos de usuario y contraseña del repositorio original: **dejalos vacíos** (es público).
   - **Owner:** tu usuario.
   - **Repository name:** el nombre que quieras, por ejemplo `gastos`.
   - Marcá **Private**.
3. Tocá **Begin import** y esperá unos minutos. GitHub te avisa cuando termina (también por mail).
4. Abrí tu repositorio nuevo (`https://github.com/<tu-usuario>/gastos`) y verificá que ves carpetas como `app`, `docs` y `lib`. Listo: el código ya es tuyo.

## Paso 3 — Crear tu cuenta de Vercel

Vercel es el servicio que publica la app en internet.

1. Entrá a <https://vercel.com/signup>.
2. Elegí el plan **Hobby** (gratis, para uso personal).
3. Elegí **Continue with GitHub** y autorizá el acceso. Así Vercel puede ver tu repositorio.

## Paso 4 — Generar las claves secretas

La app necesita **4 claves al azar**. Sirven para cifrar tus datos y proteger el acceso. Cada una es un texto de 44 caracteres que termina en `=`.

**En Mac:** abrí la app **Terminal** (Cmd + Espacio, escribí "Terminal" y Enter). Pegá esto y apretá Enter:

```bash
openssl rand -base64 32
```

Aparece una línea como `q3Jk...Zx8=`. Esa es una clave. Repetí el comando 4 veces para tener 4 claves distintas.

**En Windows:** abrí **PowerShell** (menú Inicio, escribí "PowerShell" y Enter). Pegá esto y apretá Enter, 4 veces:

```powershell
$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

Ahora armá en tu gestor de contraseñas (o en una nota **que después borres**) un bloque así, reemplazando lo que está entre `< >`:

```
SESSION_SECRET=<clave 1>
ENCRYPTION_KEY=<clave 2>
DEDUP_HMAC_KEY=<clave 3>
CRON_SECRET=<clave 4>
BOOTSTRAP_USERNAME=diego
BOOTSTRAP_PASSWORD=<tu contraseña para entrar a la app, de 12 caracteres o más>
```

Qué es cada cosa:

| Variable | Para qué sirve |
|---|---|
| `SESSION_SECRET` | Firma tu sesión cuando entrás a la app. |
| `ENCRYPTION_KEY` | Cifra las descripciones y notas de tus gastos. **Guardala para siempre: si la perdés, esos textos no se pueden volver a leer.** |
| `DEDUP_HMAC_KEY` | Detecta gastos repetidos cuando subís un archivo dos veces. **Tampoco la cambies después.** |
| `CRON_SECRET` | Protege el recordatorio automático del día 20. |
| `BOOTSTRAP_USERNAME` | Tu usuario para el primer ingreso (por ejemplo `diego`). |
| `BOOTSTRAP_PASSWORD` | Tu contraseña para el primer ingreso. Mínimo 12 caracteres. |

## Paso 5 — Crear el proyecto en Vercel

1. En Vercel, tocá **Add New…** → **Project**.
2. En la lista **Import Git Repository** buscá tu repositorio (`gastos`) y tocá **Import**.
   - Si no aparece: tocá **Adjust GitHub App Permissions** (o "Configure GitHub App"), dale acceso a ese repositorio y volvé.
3. En la pantalla de configuración:
   - **Project Name:** el que quieras. Va a ser parte de la dirección de la app (por ejemplo, `gastos-diego` → `gastos-diego.vercel.app`).
   - **Framework Preset:** tiene que decir **Next.js** (lo detecta solo).
   - No toques **Build and Output Settings**: el proyecto ya trae su configuración.
4. Abrí **Environment Variables**. Copiá el bloque completo del paso 4 y pegalo en el primer casillero **Key**: Vercel separa solo cada línea en su nombre y su valor. Verificá que quedaron las 6 variables.
5. Tocá **Deploy** y esperá 2 o 3 minutos.

**Es normal que esta primera vez la app muestre un error**: todavía falta la base de datos. Seguí con el paso 6.

## Paso 6 — Agregar la base de datos (Neon)

Neon es la base de datos donde se guardan tus gastos. Se crea desde Vercel y queda conectada sola.

1. En tu proyecto de Vercel, andá a la pestaña **Storage**.
2. Tocá **Create Database** (o **Connect Database**) y elegí **Neon** (Serverless Postgres). Tocá **Continue**.
3. Aceptá los términos y elegí:
   - **Plan:** Free.
   - **Region:** **US East (N. Virginia) / Washington, D.C.** Es la misma región donde corre la app en Vercel; así responde más rápido.
   - **Name:** por ejemplo `gastos-db`.
4. Cuando pregunte a qué entornos conectarla, tildá **Production** y **Preview**. Si ofrece crear una **branch de base para cada preview**, activala: así las pruebas de cambios nunca tocan tus datos reales.
5. Confirmá. Vercel agrega sola la variable `DATABASE_URL` a tu proyecto (no tenés que copiar nada).

## Paso 7 — Publicar y anotar la dirección de tu app

1. Andá a la pestaña **Deployments**, tocá los tres puntos (**⋯**) del deploy de más arriba y elegí **Redeploy** → **Redeploy**. Esperá a que diga **Ready**.
2. Andá a **Settings** → **Domains** y anotá la dirección de tu app (por ejemplo `https://gastos-diego.vercel.app`).
3. Andá a **Settings** → **Environment Variables** y agregá una variable más:
   - **Key:** `APP_URL`
   - **Value:** la dirección del punto anterior, con `https://` y sin `/` al final.
4. Hacé **Redeploy** otra vez (como en el punto 1). Esta dirección es la que va en los links del mail de recordatorio.

## Paso 8 — Entrar por primera vez

1. Abrí la dirección de tu app.
2. Entrá con el `BOOTSTRAP_USERNAME` y el `BOOTSTRAP_PASSWORD` del paso 4. En ese primer ingreso la app crea tu usuario.
3. Aparece el **tutorial** de bienvenida: recorrelo, son 9 pasos cortos.
4. Por seguridad, ahora borrá la contraseña de Vercel: **Settings** → **Environment Variables** → `BOOTSTRAP_PASSWORD` → **⋯** → **Remove**. Ya no hace falta: tu usuario quedó creado y el ingreso inicial se desactiva solo.
5. Si querés cambiar la contraseña, hacelo desde **Ajustes** en la app.

**En el teléfono:** abrí la dirección en el navegador y elegí "Agregar a pantalla de inicio". Queda como una app más.

## Paso 9 — Configurar tus datos en Ajustes

En la app, andá a **Ajustes** y completá:

- **Tarjetas BBVA:** los últimos 4 dígitos de la física y de la virtual. Con eso la app sugiere si un gasto es de la empresa o personal según la tarjeta.
- **Tarifa por km (EUR):** viene en 0,35.
- **Zona horaria, día y hora del recordatorio:** viene el día 20.
- **Email del recordatorio:** el mail donde querés recibir el aviso mensual.
- **Email del destinatario de la rendición:** el mail de la empresa al que mandás la rendición.
- **Usuarios:** si alguien te ayuda con la rendición, creale un usuario. Ve los mismos datos que vos.

Para el uso de todos los meses, mirá la [guía rápida](GUIA-DIEGO.md).

## Paso 10 — Activar la IA (opcional, recomendado)

Sin IA la app funciona igual, pero la primera clasificación la hacen solo tus reglas y vas a tener que marcar más gastos a mano. Con IA, Claude sugiere si cada gasto aplica y su categoría.

A la IA solo se le manda lo mínimo: comercio, monto, moneda, fecha, banco, tipo de tarjeta y viaje. Nunca tu nombre, tus cuentas ni los archivos.

1. Entrá a <https://console.anthropic.com> y creá una cuenta.
2. En **Billing**, cargá crédito (el mínimo alcanza para muchos meses).
3. En **API Keys** → **Create Key**, ponele de nombre `gastos` y copiá la clave (empieza con `sk-ant-`). **Solo se muestra una vez.**
4. En Vercel → **Settings** → **Environment Variables**, agregá:
   - **Key:** `ANTHROPIC_API_KEY` · **Value:** la clave que copiaste.
5. **Redeploy** (como en el paso 7).

## Paso 11 — Activar el mail del recordatorio (opcional, recomendado)

Sin esto, la app no manda mails: el recordatorio del día 20 no te llega (todo lo demás funciona).

1. Entrá a <https://resend.com/signup> y creá una cuenta **con el mismo mail que pusiste en "Email del recordatorio"** (paso 9).
2. En **API Keys** → **Create API Key**, nombre `gastos`, permiso **Sending access**. Copiá la clave (empieza con `re_`).
3. En Vercel → **Settings** → **Environment Variables**, agregá:
   - **Key:** `RESEND_API_KEY` · **Value:** la clave que copiaste.
4. **Redeploy**.

> Sin dominio propio, Resend solo deja mandar mails **a la dirección con la que creaste la cuenta**. Para el recordatorio alcanza. Si algún día querés mandar mails a otras personas, hay que verificar un dominio en Resend (**Domains**) y agregar la variable `MAIL_FROM`, por ejemplo `Gastos <gastos@tudominio.com>`.

**Para probar que llega:**

1. En la app, **Ajustes** → poné como día del recordatorio **el de hoy** y una hora que ya haya pasado. Guardá.
2. En Vercel → **Settings** → **Cron Jobs** → tocá **Run** en `/api/cron/reminder`.
3. Revisá tu mail (y la carpeta de spam).
4. Volvé a poner el día que quieras (por ejemplo, 20).

## Paso 12 — Cambiar la app con Claude Code

Ahora la app es tuya: le podés pedir cambios a Claude en castellano, sin programar. El proyecto ya trae instrucciones para Claude (archivo `CLAUDE.md` y `docs/PRD.md`), así que entiende cómo está hecho.

1. Entrá a <https://claude.ai/code> y conectá tu cuenta de GitHub cuando te lo pida.
2. Elegí tu repositorio (`gastos`).
3. Pedile lo que quieras, por ejemplo:
   - "Agregá la categoría *Estacionamiento*."
   - "En el PDF de la rendición poné mi nombre y el de la empresa arriba."
   - "Actualizá el README y el PRD para que digan que el repositorio es `<tu-usuario>/gastos` y no `sebascoler/expenses-diego`."
4. Claude hace el cambio, corre las pruebas y abre un **pull request** (una propuesta de cambio) en tu GitHub.
5. Vercel arma una **vista previa** de ese cambio con su propio link: abrilo y probalo.
6. Si te gusta, en GitHub abrí el pull request y tocá **Merge pull request**. En 2 o 3 minutos Vercel publica la versión nueva en tu dirección de siempre.

**Si querés traer mejoras del proyecto original** más adelante, pedile a Claude Code: "Traé los cambios nuevos de `https://github.com/sebascoler/expenses-diego` a mi repositorio y abrí un pull request".

---

## Si algo no funciona

| Qué pasa | Qué hacer |
|---|---|
| La app muestra "Application error" o una página de error | En Vercel → **Logs**, buscá una línea que empiece con `[config] Falta…`: dice qué variable falta. Agregala y hacé **Redeploy**. |
| No puedo entrar la primera vez | Revisá que `BOOTSTRAP_USERNAME` y `BOOTSTRAP_PASSWORD` estén bien escritos y que la contraseña tenga 12 caracteres o más. Si los cambiaste, hacé **Redeploy**. En **Logs**, las líneas `[auth] bootstrap…` dicen el motivo. |
| Me olvidé la contraseña | Si hay otro usuario, que entre y te cree uno nuevo desde **Ajustes → Usuarios**. Si no, pedile a Claude Code: "Necesito resetear la contraseña del usuario diego con `pnpm user:reset-password` en mi base de producción" y seguí sus instrucciones. |
| No aparece mi repositorio al importar en Vercel | **Adjust GitHub App Permissions** y dale acceso a ese repositorio. |
| No me llega el mail del recordatorio | Revisá spam; que `RESEND_API_KEY` esté cargada; que el "Email del recordatorio" sea el mismo de tu cuenta de Resend; y que hayas hecho **Redeploy** después de agregar la clave. |
| La IA no clasifica | Revisá que `ANTHROPIC_API_KEY` esté cargada, que tengas crédito en la consola de Anthropic y que hayas hecho **Redeploy**. |
| Un cambio de Claude rompió algo | En Vercel → **Deployments**, buscá el deploy anterior que andaba, **⋯** → **Promote to Production** (o **Instant Rollback**). Vuelve al instante. |

## Si ya usaste la app de Sebastián y querés llevarte los datos

Lo más simple es **empezar de cero** en tu copia: subís de nuevo los extractos de los meses que no rendiste y listo.

Si igual querés pasar los datos, es un trabajo técnico de 15 minutos: pedíselo a Sebastián (o a Claude Code). Hay que copiar la base de datos y, **muy importante**, usar en tu proyecto los mismos `ENCRYPTION_KEY` y `DEDUP_HMAC_KEY` que tenía la app original; si no, las descripciones cifradas no se pueden leer y los duplicados no se detectan.

## Seguridad: reglas que no se rompen

- Tu repositorio de GitHub queda **privado**.
- Las claves van **solo** en Vercel (Environment Variables) y en tu gestor de contraseñas. Nunca en el código, en un chat ni en un mail.
- **Nunca** cambies `ENCRYPTION_KEY` ni `DEDUP_HMAC_KEY` mientras tengas datos cargados.
- Activá la verificación en dos pasos en GitHub y en Vercel.
- La app no guarda los archivos del banco: los procesa y los descarta.

## Checklist final

- [ ] Repositorio privado en mi GitHub.
- [ ] Proyecto en Vercel con las variables `SESSION_SECRET`, `ENCRYPTION_KEY`, `DEDUP_HMAC_KEY`, `CRON_SECRET`, `BOOTSTRAP_USERNAME` y `APP_URL`.
- [ ] Base Neon conectada (`DATABASE_URL` aparece sola en Vercel).
- [ ] Entré a la app y recorrí el tutorial.
- [ ] Borré `BOOTSTRAP_PASSWORD` de Vercel.
- [ ] Cargué tarjetas, mails y recordatorio en Ajustes.
- [ ] (Opcional) `ANTHROPIC_API_KEY` cargada.
- [ ] (Opcional) `RESEND_API_KEY` cargada y probé que llega el mail.
- [ ] Las 4 claves guardadas en mi gestor de contraseñas.
