# Informe de estabilidad, seguridad, rendimiento y calendario

Fecha de auditoria: 2026-08-07
Proyecto: M&I Control / App de Finanzas
Alcance: cliente HTML/CSS/ES Modules, Service Worker, servidor de preview, reglas de despliegue y esquema Supabase/RLS.

## Resumen ejecutivo

Se corrigieron 8 problemas reproducibles o de alto impacto:

1. XSS almacenado potencial mediante nombres/subcategorias de categorias personalizadas.
2. Fallo del dashboard al pasar de cero movimientos a tener movimientos.
3. Datos de un grupo anterior que podian sobrescribir al grupo nuevo despues de un cambio rapido.
4. Fechas locales que podian guardar o mostrar el dia anterior por el uso de `toISOString()`.
5. Eventos de dia completo de Google Calendar con fecha final no exclusiva.
6. Carreras entre solicitudes OAuth y ausencia de renovacion automatica despues de un 401.
7. Eventos de Calendar huerfanos cuando fallaba la persistencia en Supabase.
8. Funciones `SECURITY DEFINER` expuestas al privilegio por defecto de `PUBLIC`.

Tambien se agregaron timeout para llamadas a Calendar, codificacion segura de IDs en URLs, cabeceras de seguridad, ruta local `/share/{uuid}`, version nueva del cache PWA y una suite de regresion ejecutable con `npm test`.

## Hallazgos y correcciones

| ID | Severidad | Hallazgo | Estado |
| --- | --- | --- | --- |
| SEC-01 | Alta | Categorias creadas por el usuario se interpolaban sin escape en varios `<option>`. | Corregido con `esc()` en todos los selectores relevantes y prueba de regresion. |
| SEC-02 | Alta | Las funciones privilegiadas del esquema tenian el `EXECUTE` por defecto de PostgreSQL para `PUBLIC`. | Corregido con `REVOKE ALL ... FROM PUBLIC`; se debe ejecutar `schema.sql` en Supabase. |
| SEC-03 | Media | El servidor de preview no tenia cabeceras defensivas ni decodificacion controlada de rutas. | Corregido con validacion de ruta, fallback SPA limitado y cabeceras `nosniff`, `SAMEORIGIN`, `Referrer-Policy` y `Permissions-Policy`. |
| STAB-01 | Alta | Al reemplazar el canvas por “sin datos”, el siguiente render intentaba acceder a `parentElement` de un elemento inexistente. | Corregido con wrappers estables, recreacion del canvas y destruccion segura de Chart.js. |
| STAB-02 | Alta | Respuestas asincronas de grupos/categorias podian llegar fuera de orden. | Corregido con identificadores de solicitud para aceptar solo el snapshot vigente. |
| DATA-01 | Media | `toISOString()` podia desplazar la fecha local al dia anterior. | Corregido con `fechaLocalISO()` y validacion de fechas ISO. |
| CAL-01 | Alta | Un evento de dia completo usaba la misma fecha en `start` y `end`. | Corregido: `end.date` es el dia siguiente, como exige Google Calendar. |
| CAL-02 | Alta | Tokens concurrentes, expirados o llamadas 401 podian dejar la sincronizacion inutilizable. | Corregido con promesa compartida, espera de GIS, margen de expiracion, reintento 401 y timeout de 15 s. |
| CAL-03 | Alta | Si Calendar creaba el evento y Supabase fallaba despues, quedaba un evento remoto huerfano. | Corregido: primero se crea la fila local; luego se enlaza el evento y se limpia mediante compensacion si falla el enlace. |
| CAL-04 | Media | El borrado local podia ocultar un evento que seguia en Calendar. | Corregido: primero se elimina Calendar; solo despues se elimina la fila local. 404/410 se tratan como ya eliminado. |
| PWA-01 | Media | El Service Worker podia conservar el shell antiguo despues de cambios. | Cache incrementado de `v4` a `v5`. |

## Cambios realizados

- `js/googleCalendar.js`: flujo OAuth concurrente, renovacion, timeout, errores descriptivos, fechas de dia completo, validacion y `encodeURIComponent()`.
- `js/modules/recordatorios.js`: persistencia compensatoria, control de fallos remotos, filtro por usuario y calculo correcto de vencimiento cuando Supabase devuelve `HH:mm:ss`.
- `js/dataLayer.js` y `js/categories.js`: consultas paralelas con columnas explicitas y proteccion contra respuestas obsoletas.
- `js/modules/dashboard.js` e `index.html`: wrappers de charts estables y compatibilidad cuando Chart.js no esta disponible.
- `js/utils.js`, `js/app.js` y `js/modules/agregar.js`: fechas locales y validacion de entradas.
- `js/auth.js`: tokens de invitacion validados como UUID y almacenados temporalmente en `sessionStorage` durante OAuth.
- `preview-server.cjs`, `netlify.toml` y `vercel.json`: cabeceras de seguridad, rutas SPA y control de rutas.
- `schema.sql`: revocacion explicita de privilegios publicos en funciones sensibles.
- `tests/regression.test.mjs` y `package.json`: suite automatizada y script `npm test`.

## Pruebas ejecutadas

### Automatizadas

Resultado: **6/6 aprobadas** con `npm test`.

- Sintaxis valida de todos los modulos JavaScript.
- JSON valido de despliegue y manifest.
- Version del Service Worker y precache coherentes.
- Proteccion de rutas del servidor de preview.
- RLS habilitado en tablas financieras, notas y recordatorios.
- Privilegios publicos revocados en funciones privilegiadas.
- Categorias personalizadas escapadas.
- Eventos Calendar: dia completo, fecha final exclusiva y rechazo de fecha invalida.

### Smoke test HTTP

- `/` devolvio HTTP 200.
- `/share/123e4567-e89b-12d3-a456-426614174000` devolvio `index.html` con HTTP 200.
- `js/googleCalendar.js` devolvio HTTP 200.
- Se observaron cabeceras defensivas en el servidor local.

### Rendimiento local

- 100 solicitudes concurrentes de `js/app.js`: 100/100 correctas.
- Tiempo total observado: aproximadamente 201 ms.
- Promedio aproximado: 2 ms por solicitud.

Este resultado solo mide el servidor estatico local; no representa la latencia de Supabase, Google Calendar, OAuth ni el rendimiento con grandes volumenes de datos.

### No ejecutado en este entorno

- Flujo UI con navegador real y sesion autenticada.
- Login Google/Supabase y aceptacion de invitaciones.
- Creacion, actualizacion, revocacion y borrado real de eventos en Google Calendar.
- Prueba RLS contra una instancia Supabase real.
- Prueba de carga de consultas con datos historicos grandes.

No habia un navegador conectado disponible y no se deben simular estas pruebas con credenciales de produccion.

## Pendientes antes de publicar

1. Ejecutar el `schema.sql` actualizado en Supabase y validar con dos cuentas: owner y viewer. Confirmar que anon no puede invocar las funciones RPC sensibles.
2. Configurar `GOOGLE_CLIENT_ID`, habilitar Google Calendar API y registrar todos los origenes de desarrollo/produccion.
3. En staging autenticado, probar un recordatorio sin hora, uno con hora, token expirado, acceso revocado, evento borrado directamente desde Google y fallo de red.
4. Confirmar que `APP_PUBLIC_URL` coincide con el dominio real de despliegue y revisar Redirect URLs de Supabase.
5. Ejecutar Lighthouse y una herramienta DAST (por ejemplo ZAP) sobre staging; revisar CSP efectiva desde las cabeceras reales.
6. Para historiales grandes, paginar o agregar consultas de `expenses`, `incomes`, `debts` y `record_notes`; actualmente la UI carga todo el grupo en cada refresco.
7. Fijar la version de `@supabase/supabase-js` y agregar SRI o un mecanismo equivalente para dependencias CDN antes de exigir una politica de supply-chain mas estricta.
8. Sustituir los handlers inline `onclick` por listeners de modulo para poder eliminar `'unsafe-inline'` de CSP.

## Criterio recomendado de salida

La version esta lista para una **publicacion controlada en staging**. No recomiendo el despliegue general hasta completar los puntos 1 a 3, porque dependen de servicios externos y son necesarios para demostrar que la integracion de calendario y el aislamiento RLS funcionan en produccion.

## Addendum: estabilidad de conexion y revision visual

Se incorporo una segunda capa de estabilidad:

- Supabase usa timeout de 20 segundos para no dejar la interfaz esperando indefinidamente.
- Las lecturas se reintentan con backoff; las escrituras no se reintentan automaticamente para evitar duplicados.
- Si falla la BD, se conserva el ultimo estado correcto en pantalla en vez de reemplazarlo por listas vacias.
- Si falla solo `record_notes`, los datos financieros siguen disponibles y las notas anteriores se conservan hasta recuperar la conexion.
- Se muestra el estado `Sincronizando`, `Datos sincronizados`, `Reintentando`, `Sin conexion` o `Error`.
- Al volver online, la app intenta sincronizar de nuevo automaticamente.
- Se sustituyo el favicon generico de dolar por `mi-control.png` y se agrego cache-busting para que el logo aparezca en la pestana.
- Smoke test final: raiz, favicon y `dataLayer.js` respondieron HTTP 200; el HTML incluyo el indicador de conexion y el favicon de marca.
