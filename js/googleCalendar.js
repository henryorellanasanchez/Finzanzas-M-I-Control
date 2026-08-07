/* Integracion opcional con Google Calendar para los recordatorios. */
import { GOOGLE_CLIENT_ID, GOOGLE_CALENDAR_SCOPE } from './config.js';
import { state } from './state.js';
import { fechaISOValida, toast } from './utils.js';

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let tokenRequestPromise = null;

function clientConfigurado(){
  return Boolean(GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('PEGA_AQUI'));
}

function clearToken(){
  accessToken = null;
  tokenExpiresAt = 0;
  state.googleCalendarConnected = false;
}

function waitForGoogleIdentityServices(timeoutMs = 6000){
  if(window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject)=>{
    const started = Date.now();
    const timer = window.setInterval(()=>{
      if(window.google?.accounts?.oauth2){
        window.clearInterval(timer);
        resolve();
      } else if(Date.now() - started >= timeoutMs){
        window.clearInterval(timer);
        reject(new Error('Google Identity Services no disponible'));
      }
    }, 100);
  });
}

function ensureTokenClient(){
  if(tokenClient) return tokenClient;
  if(!window.google?.accounts?.oauth2) return null;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: GOOGLE_CALENDAR_SCOPE,
    callback: () => {},
  });
  return tokenClient;
}

export function calendarConectado(){
  return Boolean(accessToken && Date.now() < tokenExpiresAt - 30000);
}

/** Solicita un token; las llamadas concurrentes comparten un solo popup. */
export function conectarGoogleCalendar(){
  if(!clientConfigurado()){
    toast('Falta configurar GOOGLE_CLIENT_ID en js/config.js', 'err');
    return Promise.reject(new Error('GOOGLE_CLIENT_ID no configurado'));
  }
  if(calendarConectado()) return Promise.resolve(accessToken);
  if(tokenRequestPromise) return tokenRequestPromise;

  tokenRequestPromise = (async()=>{
    try{
      await waitForGoogleIdentityServices();
      const client = ensureTokenClient();
      if(!client) throw new Error('Google Identity Services no disponible');
      return await new Promise((resolve, reject)=>{
        client.callback = (response)=>{
          if(response?.error){
            toast('No se pudo conectar con Google Calendar', 'err');
            reject(response);
            return;
          }
          accessToken = response.access_token;
          tokenExpiresAt = Date.now() + ((response.expires_in || 3300) * 1000);
          state.googleCalendarConnected = true;
          toast('Google Calendar conectado');
          resolve(accessToken);
        };
        try{ client.requestAccessToken({ prompt: '' }); }
        catch(error){ reject(error); }
      });
    }catch(error){
      clearToken();
      if(error?.message === 'Google Identity Services no disponible'){
        toast('No se pudo cargar Google Identity Services', 'err');
      }
      throw error;
    }finally{
      tokenRequestPromise = null;
    }
  })();
  return tokenRequestPromise;
}

export function desconectarGoogleCalendar(){
  if(accessToken && window.google?.accounts?.oauth2?.revoke){
    window.google.accounts.oauth2.revoke(accessToken, ()=>{});
  }
  clearToken();
  toast('Google Calendar desconectado');
}

async function withToken(){
  if(!calendarConectado()) await conectarGoogleCalendar();
  return accessToken;
}

function addOneHourISO(dateTimeLocal){
  const [datePart, timePart] = dateTimeLocal.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  const date = new Date(year, month - 1, day, hour, minute);
  date.setHours(date.getHours() + 1);
  const pad = n => String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function nextISODate(value){
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);
  const pad = n => String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

export function eventBody({ titulo, descripcion, fecha, hora }){
  if(!String(titulo||'').trim()) throw new Error('El evento necesita un título');
  if(!fechaISOValida(fecha)) throw new Error('La fecha del evento no es válida');
  const cleanTime = hora ? String(hora).slice(0, 5) : '';
  if(cleanTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(cleanTime)){
    throw new Error('La hora del evento no es válida');
  }
  const base = { summary: String(titulo).trim(), description: descripcion || '' };
  if(cleanTime){
    const start = `${fecha}T${cleanTime}:00`;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return {
      ...base,
      start: { dateTime: start, timeZone: tz },
      end: { dateTime: addOneHourISO(start), timeZone: tz },
      reminders: { useDefault: true },
    };
  }
  // Google Calendar usa una fecha final exclusiva para eventos de día completo.
  return {
    ...base,
    start: { date: fecha },
    end: { date: nextISODate(fecha) },
    reminders: { useDefault: true },
  };
}

async function calendarRequest(path, options = {}, retry = true){
  const token = await withToken();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  let response;
  try{
    response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
      ...options,
      signal: controller.signal,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });
  }finally{
    window.clearTimeout(timeout);
  }
  if(response.status === 401 && retry){
    clearToken();
    await conectarGoogleCalendar();
    return calendarRequest(path, options, false);
  }
  if(!response.ok){
    let detail = '';
    try{ detail = (await response.text()).slice(0, 240); }catch{}
    throw new Error(`Google Calendar ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return response;
}

export async function crearEventoCalendar(recordatorio){
  const response = await calendarRequest('/calendars/primary/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody(recordatorio)),
  });
  const data = await response.json();
  if(!data.id) throw new Error('Google Calendar no devolvió un id de evento');
  return data.id;
}

export async function actualizarEventoCalendar(eventId, recordatorio){
  if(!eventId) return null;
  const response = await calendarRequest(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventBody(recordatorio)),
  });
  return response.status === 204 ? null : response.json();
}

export async function eliminarEventoCalendar(eventId){
  if(!eventId) return;
  try{
    await calendarRequest(`/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  }catch(error){
    // Un evento eliminado desde Google ya no requiere una segunda eliminación.
    if(!/Google Calendar (404|410)/.test(error.message || '')) throw error;
  }
}
