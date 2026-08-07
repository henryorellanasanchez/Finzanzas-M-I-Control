/* ====================================================================
   googleCalendar.js — conexión con Google Calendar para sincronizar
   Recordatorios. No usa gapi ni ninguna librería extra: pide un access
   token con Google Identity Services (script cargado en index.html) y
   llama directo a la REST API de Calendar con fetch().

   Este token es *independiente* del login de la app (que va por
   Supabase Auth): es un permiso aparte que el usuario concede la
   primera vez que intenta sincronizar un recordatorio. Vive solo en
   memoria (nunca en localStorage) y dura ~1 hora; si expira, se vuelve
   a pedir automáticamente la próxima vez que se necesite.
   ==================================================================== */
import { GOOGLE_CLIENT_ID, GOOGLE_CALENDAR_SCOPE } from './config.js';
import { state } from './state.js';
import { toast } from './utils.js';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

function clientConfigurado(){
  return !!GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('PEGA_AQUI');
}

function ensureTokenClient(){
  if(tokenClient) return tokenClient;
  if(!window.google?.accounts?.oauth2){
    toast('No se pudo cargar Google Identity Services (revisa tu conexión)', 'err');
    return null;
  }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_CALENDAR_SCOPE,
    callback: () => {}, // se reasigna en cada llamada, ver pedirToken()
  });
  return tokenClient;
}

export function calendarConectado(){
  return !!accessToken && Date.now() < tokenExpiresAt;
}

/** Pide (o reutiliza) un access token con permiso de Calendar. Muestra el
 *  popup de consentimiento de Google solo la primera vez o si el usuario
 *  revocó el acceso; después reutiliza el token silenciosamente. */
export function conectarGoogleCalendar(){
  return new Promise((resolve, reject)=>{
    if(!clientConfigurado()){
      toast('Falta configurar GOOGLE_CLIENT_ID en js/config.js', 'err');
      reject(new Error('GOOGLE_CLIENT_ID no configurado'));
      return;
    }
    if(calendarConectado()){ resolve(accessToken); return; }
    const client = ensureTokenClient();
    if(!client){ reject(new Error('token client no disponible')); return; }
    client.callback = (resp)=>{
      if(resp.error){
        toast('No se pudo conectar con Google Calendar', 'err');
        reject(resp);
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + ((resp.expires_in || 3300) * 1000);
      state.googleCalendarConnected = true;
      toast('Google Calendar conectado ✓');
      resolve(accessToken);
    };
    client.requestAccessToken({ prompt: '' });
  });
}

export function desconectarGoogleCalendar(){
  if(accessToken && window.google?.accounts?.oauth2?.revoke){
    window.google.accounts.oauth2.revoke(accessToken, ()=>{});
  }
  accessToken = null;
  tokenExpiresAt = 0;
  state.googleCalendarConnected = false;
  toast('Google Calendar desconectado');
}

async function withToken(){
  if(!calendarConectado()) await conectarGoogleCalendar();
  return accessToken;
}

function addOneHourISO(dateTimeLocal){
  const d = new Date(dateTimeLocal);
  d.setHours(d.getHours() + 1);
  // toISOString() da UTC con 'Z'; para un dateTime "naive" + timeZone alcanza
  // con mantener el mismo formato local que recibimos.
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

function eventBody({ titulo, descripcion, fecha, hora }){
  if(hora){
    const start = `${fecha}T${hora}:00`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      summary: titulo,
      description: descripcion || '',
      start: { dateTime: start, timeZone: tz },
      end: { dateTime: addOneHourISO(start), timeZone: tz },
      reminders: { useDefault: true },
    };
  }
  return {
    summary: titulo,
    description: descripcion || '',
    start: { date: fecha },
    end: { date: fecha },
    reminders: { useDefault: true },
  };
}

/** Crea un evento y devuelve su id (para guardarlo en reminders.google_event_id). */
export async function crearEventoCalendar(recordatorio){
  const token = await withToken();
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody(recordatorio)),
  });
  if(!res.ok) throw new Error('No se pudo crear el evento en Google Calendar');
  const data = await res.json();
  return data.id;
}

export async function actualizarEventoCalendar(eventId, recordatorio){
  const token = await withToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody(recordatorio)),
  });
  if(!res.ok) throw new Error('No se pudo actualizar el evento en Google Calendar');
  return await res.json();
}

export async function eliminarEventoCalendar(eventId){
  const token = await withToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  // 410 Gone = ya no existía en Calendar; lo tratamos como éxito igual.
  if(!res.ok && res.status !== 410 && res.status !== 404){
    throw new Error('No se pudo eliminar el evento en Google Calendar');
  }
}
