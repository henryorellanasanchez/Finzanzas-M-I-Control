# App de Finanzas — guía de implementación

Esto es lo que armé a partir de tu especificación y tu archivo `finanzas_henry_app__1_.html`. No tengo acceso de red desde este entorno, así que no pude conectarme a tu proyecto Supabase ni hacer push a tu repo de GitHub directamente — los 3 pasos manuales abajo son justamente eso.

Pediste que quedara **modular** para poder agregar más módulos después, así que la reescribí en archivos separados con ES Modules nativos del navegador (sin bundler, sin paso de build — sigue siendo HTML/CSS/JS plano que cualquier hosting estático puede servir).

## Estructura de archivos

```
index.html                  ← shell: solo HTML, sin lógica
css/
  app.css                    ← todos los estilos (igual que antes, solo movido)
js/
  config.js                  ← credenciales de Supabase (el único archivo que DEBES editar)
  constants.js                ← categorías, meses, colores
  state.js                     ← estado en memoria compartido (sesión, grupo activo, datos)
  registry.js                  ← registro de módulos/pestañas
  utils.js                      ← fmt, esc, toast, modal genérico... sin dependencias internas
  ui.js                          ← showTab/refresh/filtros de año, lee el registro de módulos
  auth.js                         ← login Google, perfil, grupos, roles owner/viewer
  dataLayer.js                     ← lee Supabase y llena el estado (lo único que hace SELECT *)
  theme.js                          ← tema claro/oscuro
  app.js                             ← punto de entrada: registra módulos y arranca la app
  modules/
    dashboard.js                     ← pestaña "Resumen"
    agregar.js                       ← pestaña "Agregar" (gasto/ingreso/deuda/pago)
    gastos.js                        ← pestaña "Gastos"
    ingresos.js                      ← pestaña "Ingresos"
    deudas.js                        ← pestaña "Deudas"
    presupuestos.js                  ← pestaña "Presupuestos"
    mensual.js                       ← pestaña "Mensual"
    notas.js                         ← pestaña "Notas" (privadas, no usan group_id)
    recordatorios.js                 ← pestaña "Recordatorios" (privados, con sync a Google Calendar)
    compartir.js                     ← modal de invitaciones/miembros (botón 🔗)
    exportar.js                      ← exportar CSV (botón ⇩)
    registros.js                     ← borrar gasto/ingreso (compartido por dos pestañas)
  googleCalendar.js          ← conexión OAuth con Google Calendar (usada solo por recordatorios.js)
schema.sql                  ← tablas + RLS + función accept_invitation (corre una vez en Supabase)
netlify.toml / vercel.json  ← reglas de redirección para /share/{token}
```

## Módulo nuevo ya agregado como ejemplo: Notas privadas

Agregué la pestaña **Notas** siguiendo exactamente el patrón de extensión descrito arriba — sirve como ejemplo real de "cómo se agrega un módulo":

- `js/modules/notas.js`, tabla `notes` en `schema.sql`, pestaña y sección en `index.html`, dos líneas en `app.js`.
- A propósito **no** usa `group_id`: la tabla `notes` se relaciona por `user_id`, y sus políticas RLS solo dejan ver/editar la nota a quien la escribió — ni siquiera el owner del grupo puede verla. No tiene la bandera `ownerOnly`, así que tanto el owner como cualquier viewer del grupo pueden tener sus propias notas privadas.
- Si ya habías corrido `schema.sql` antes, solo necesitas volver a correrlo: todo usa `create table if not exists` / `drop policy if exists`, así que es seguro ejecutarlo de nuevo sin duplicar ni romper nada.

## Módulo nuevo: Recordatorios (con sincronización a Google Calendar)

Igual que Notas, es privado por usuario (tabla `reminders`, sin `group_id`). Cada recordatorio tiene título, descripción opcional, fecha, hora opcional y prioridad (alta/media/baja), y se puede marcar como completado.

Lo interesante es la sincronización: al tildar "Agregar también a Google Calendar" antes de guardar, la app crea un evento real en el calendario del usuario y guarda su `id` en `reminders.google_event_id`. Ese permiso de Calendar es **independiente** del login (que va por Google vía Supabase): es un OAuth aparte, manejado por `js/googleCalendar.js` con Google Identity Services, que solo pide consentimiento la primera vez y no toca tu backend — la app llama directo a `googleapis.com` desde el navegador con el token del propio usuario.

Antes de que esto funcione tienes que crear un **Client ID de Google OAuth** (ver paso 4 más abajo) y pegarlo en `js/config.js`. Si lo dejas con el valor de ejemplo, la pestaña sigue funcionando (guardar/editar/borrar recordatorios), solo que el botón "Conectar Google Calendar" va a avisarte que falta configurarlo en vez de fallar en silencio.

## Instalar como app en el celular (iOS y Android)

- **iPhone (Safari)**: botón Compartir → "Agregar a inicio". Funciona directo, sin configurar nada extra — las meta tags `apple-mobile-web-app-*` de `index.html` ya se encargan de que abra a pantalla completa, sin barra de direcciones, respetando el notch.
- **Android (Chrome)**: gracias a `manifest.json` + `sw.js` (Service Worker), Chrome debería ofrecer directamente el banner/opción "Instalar app" (no solo "acceso directo"). El Service Worker es un requisito técnico de Android para esto — en iOS no hace falta y no lo usa.
- El Service Worker (`sw.js`) solo cachea el "shell" propio (HTML/CSS/JS/íconos) para que cargue rápido y sobreviva a una conexión inestable; nunca cachea nada de Supabase ni de Google, así que tus datos financieros siempre vienen frescos de la red.
- **Si editas `css/app.css` o cualquier archivo de `js/`**, sube el número de versión en `sw.js` (`CACHE_NAME = 'finanzas-shell-v1'` → `v2`) para que a los usuarios que ya instalaron la app les llegue la actualización en vez de quedarse con la versión vieja cacheada.

## Cómo agregar un módulo nuevo más adelante

Cada pestaña se "autoregistra": al final de su archivo llama a `registerModule({ id, render, ownerOnly })`. Para agregar, por ejemplo, una pestaña de "Metas de ahorro":

1. Crea `js/modules/metas.js` copiando la forma de cualquier módulo existente (por ejemplo `js/modules/deudas.js` es el más simple). Termina el archivo con:
   ```js
   registerModule({ id: 'metas', render: renderMetas });
   ```
2. En `js/app.js` agrega una línea: `import './modules/metas.js';` (eso lo registra) y, si tu módulo expone funciones que el HTML llama con `onclick="..."`, impórtalas y agrégalas al `Object.assign(window, {...})` que ya está en ese archivo.
3. En `index.html` agrega un botón de pestaña y su sección:
   ```html
   <div class="tab" data-tab="metas" onclick="showTab('metas')">Metas</div>
   ...
   <div class="section" id="sec-metas">...</div>
   ```

No hace falta tocar `ui.js`, `registry.js` ni los demás módulos — ellos no conocen los detalles de "metas", solo el contrato `{id, render, ownerOnly}`. Si el módulo necesita su propia tabla en Supabase, agrégala a `schema.sql` siguiendo el mismo patrón de RLS que ya tienen `expenses`/`incomes` (miembro lee, owner escribe).

## ⚠️ Importante para probarlo en local

Como ahora son varios archivos `.js` con `import`/`export`, **abrir `index.html` haciendo doble clic (file://) no va a funcionar** — los navegadores bloquean ES Modules por CORS en ese modo. Para probar local, sirve la carpeta con cualquier servidor estático. Ya te dejé 3 formas listas, usa la que prefieras:

- **Desde VS Code, sin terminal**: instala la extensión recomendada **Live Server** (VS Code te la va a sugerir solo al abrir la carpeta, gracias a `.vscode/extensions.json`), clic derecho sobre `index.html` → "Open with Live Server".
- **Con npm**: `npm run dev` (usa `npx serve .` por debajo, no necesita instalar nada como dependencia).
- **Con Python**: `python3 -m http.server 5500`

Luego abre `http://localhost:5500` (o el puerto que te indique). En producción (Netlify, Vercel, GitHub Pages, etc.) esto no es un problema porque ya se sirve por HTTP(S).

## Qué cambié sobre el archivo original

- **Nombre**: "Finanzas de Henry" → **"App de Finanzas"**.
- **Persistencia**: pasó de `localStorage` a **Supabase (PostgreSQL)**, con las 5 tablas de movimientos (`expenses`, `incomes`, `debts`, `debt_payments`, `budgets`) más `profiles`, `finance_groups`, `group_members`, `invitations`.
- **Autenticación**: login con **Google OAuth** vía Supabase Auth. En el primer login se pide Nombres/Apellidos (se guardan en `profiles`, identificados por `auth.uid()`, nunca por el nombre).
- **Multiusuario y roles**: cada persona puede tener varios "grupos de finanzas" (selector arriba a la izquierda). Dueño = `owner` (lee/escribe/gestiona invitados), invitado = `viewer` (solo lectura, UI bloqueada).
- **Invitaciones por enlace**: botón 🔗 "Compartir" (solo visible para el owner) genera `tudominio.com/share/{token}`, con rol y expiración opcionales, revocables.
- **Seguridad**: todo el control de acceso está en RLS de PostgreSQL, no solo en el frontend — ver `schema.sql`.
- **Continuidad multi-año**: los filtros de Gastos/Ingresos y el resumen mensual ahora distinguen año (antes asumían 2026 fijo), para que los datos sigan siendo correctos en 2027, 2028, etc. El dashboard general sigue siendo un acumulado histórico de todo el grupo.
- **Modularidad**: todo lo anterior estaba en un solo `<script>` de ~800 líneas; ahora cada pestaña/feature vive en su propio archivo (ver estructura arriba).
- Quité los datos de ejemplo (los 100+ registros de "Henry") porque ahora cada grupo empieza vacío en una base de datos real compartida.

## Pasos que tienes que hacer tú (no pude hacerlos desde aquí)

### 1. Ejecutar `schema.sql` en tu Supabase
Dashboard de tu proyecto → **SQL Editor** → pega el contenido completo de `schema.sql` → Run.
Proyecto: `https://zflayxdhxmquuchrbrff.supabase.co`

### 2. Activar Google como proveedor de login
- En Supabase: **Authentication → Providers → Google** → activarlo.
- Necesitas un **Client ID / Client Secret** de Google Cloud Console (APIs & Services → Credentials → OAuth client ID → "Web application").
- En Google Cloud, como **Authorized redirect URI** agrega exactamente:
  `https://zflayxdhxmquuchrbrff.supabase.co/auth/v1/callback`
- En Supabase: **Authentication → URL Configuration → Redirect URLs**, agrega la URL donde vas a desplegar la app (ej. `https://tu-dominio.com`, o `http://localhost:5500` mientras pruebas local).

### 3. Pegar tu "anon public key" en `js/config.js`
Abre `js/config.js` y reemplaza:
```js
export const SUPABASE_ANON_KEY = 'PEGA_AQUI_TU_SUPABASE_ANON_KEY';
```
Por la clave de **Project Settings → API → Project API keys → anon public** (esa clave es pública por diseño; lo que protege tus datos es el RLS de `schema.sql`, no el secreto de esta clave).

### 4. (Opcional) Client ID de Google para sincronizar Recordatorios con Calendar
Esto es un OAuth **distinto** al login de la app — solo hace falta si quieres que el botón "Conectar Google Calendar" de la pestaña Recordatorios funcione:
1. Ve a [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) (puede ser el mismo proyecto que ya usaste para el login, o uno nuevo).
2. **+ Crear credenciales → ID de cliente de OAuth → tipo "Aplicación web"**.
3. En **"Orígenes de JavaScript autorizados"** agrega el/los dominios donde sirves la app, ej. `http://localhost:5500` y `https://tu-dominio.com` (aquí no va ruta de redirect, GIS usa popup).
4. Ve a **APIs y servicios → Biblioteca**, busca **"Google Calendar API"** y actívala para el proyecto.
5. Copia el Client ID (termina en `.apps.googleusercontent.com`) y pégalo en `js/config.js`:
   ```js
   export const GOOGLE_CLIENT_ID = 'tu-id.apps.googleusercontent.com';
   ```

## Desplegar y el enlace `app.com/share/{token}`

Sube toda la carpeta (con la misma estructura: `index.html`, `css/`, `js/`) a Netlify, Vercel, Cloudflare Pages, GitHub Pages, etc. Ya no hay que renombrar nada — `index.html` ya se llama así.

El enlace de invitación usa una ruta tipo `/share/{token}`, lo cual requiere que el hosting redirija rutas desconocidas hacia `index.html` (típico en SPAs):
- **Netlify**: incluye `netlify.toml` en la raíz del repo (ya te lo dejé armado).
- **Vercel**: incluye `vercel.json` (también te lo dejé armado).
- **GitHub Pages**: no soporta reglas de rewrite; la forma más simple es copiar `index.html` también como `404.html` en la raíz del sitio (GitHub Pages sirve `404.html` para rutas desconocidas, y el JS de la app detecta el token igual).
- **Si no quieres configurar nada de esto**: la app también acepta el token como `?invite={token}` en la URL (funciona en cualquier hosting sin configuración extra). Solo tendrías que generar el enlace con ese formato en vez de `/share/`.

## Subir esto a tu repo de GitHub

No tengo acceso de red para hacer el push por ti. Desde tu máquina:
```bash
git clone https://github.com/henryorellanasanchez/Appfinanzas.git
cd Appfinanzas
# copia aquí index.html, css/, js/, schema.sql, netlify.toml/vercel.json
git add .
git commit -m "App de Finanzas: arquitectura modular, multiusuario, Google OAuth, grupos e invitaciones"
git push
```

## Decisiones y límites que vale la pena que conozcas

- Mantuve las funciones de **deudas, pagos y presupuestos** del archivo original (no estaban en tu lista de tablas recomendadas, pero ya existían en la app y las migré al mismo esquema de grupos/roles).
- El enlace de invitación es **reutilizable** mientras no lo revoques o expire (cualquiera con el enlace que inicie sesión se une); si prefieres que sea de un solo uso, lo puedo ajustar agregando un campo `max_usos` a `invitations`.
- No agregué borrado de deudas/pagos individuales (la app original tampoco lo tenía); si lo necesitas, es un cambio pequeño sobre el mismo patrón que ya usan `modules/registros.js`.
- Las políticas RLS más un **trigger** (`trg_prevent_orphan_group`) impiden que un grupo quede sin ningún owner: bloquea tanto eliminar como cambiarle el rol al último owner restante, con un mensaje claro en vez de fallar en silencio.
- Los `onclick="..."` del HTML siguen apuntando a funciones globales; `js/app.js` es el puente que las expone en `window`. Es la forma más simple de mantener compatibilidad con el HTML original sin reescribir cada botón a `addEventListener`. Si en algún momento preferimos ese estilo más "moderno", es un refactor aparte que no afecta la modularidad de los archivos.

Cualquier ajuste que quieras sobre roles, esquema o el flujo de invitaciones, dime y lo modifico.

