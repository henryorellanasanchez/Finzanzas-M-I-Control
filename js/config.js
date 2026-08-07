/* ====================================================================
   config.js — credenciales y cliente de Supabase.
   Es el ÚNICO archivo que necesitas tocar para conectar la app a tu
   propio proyecto Supabase.
   ==================================================================== */

// Project Settings → API → Project URL
export const SUPABASE_URL = 'https://zflayxdhxmquuchrbrff.supabase.co';
export const APP_PUBLIC_URL = 'https://henryorellanasanchez.github.io/Finzanzas-M-I-Control/';

// Project Settings → API → Project API keys → "anon public"
// Esta clave es pública por diseño; la seguridad real la da el Row
// Level Security definido en schema.sql, no el secreto de esta clave.
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RptaTrZcB_2aUf_xSkz4fA_b6GAlOCA';
// Alias de compatibilidad con el resto de la app.
export const SUPABASE_ANON_KEY = SUPABASE_PUBLISHABLE_KEY;

// `supabase` llega como variable global porque el SDK se carga vía
// <script src="..."> (UMD) en index.html, antes de este módulo.
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

// ---------------------------------------------------------------------------
// Google Calendar (para sincronizar Recordatorios). Es un OAuth *aparte* del
// login (ese lo maneja Supabase); este es un Client ID de tipo "Web
// application" en Google Cloud Console con el permiso de Calendar. Pasos:
//   1. https://console.cloud.google.com/apis/credentials → "+ Crear
//      credenciales" → "ID de cliente de OAuth" → tipo "Aplicación web".
//   2. En "Orígenes de JavaScript autorizados" agrega el dominio donde sirves
//      la app (ej. http://localhost:5500 y https://tu-dominio.com).
//   3. Habilita la API: menú → "APIs y servicios" → "Biblioteca" → busca
//      "Google Calendar API" → Habilitar.
//   4. Pega aquí el Client ID (termina en .apps.googleusercontent.com).
// Si lo dejas vacío, la app funciona igual pero el botón de sincronizar con
// Google Calendar avisa que falta configurarlo, en vez de fallar en silencio.
export const GOOGLE_CLIENT_ID = 'PEGA_AQUI_TU_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
