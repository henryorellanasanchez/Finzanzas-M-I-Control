/* ====================================================================
   modules/recordatorios.js — pestaña "Recordatorios". Igual que Notas,
   son privados por usuario (no usan group_id). Cada recordatorio puede
   además sincronizarse con Google Calendar: al marcar la casilla
   "Agregar a Google Calendar" se crea/actualiza/borra un evento real
   en el calendario del usuario, usando su propio permiso de Google
   (ver js/googleCalendar.js). El id de ese evento se guarda en
   reminders.google_event_id para poder editarlo o borrarlo después.
   ==================================================================== */
import { supabase } from '../config.js';
import { state } from '../state.js';
import { esc, toast } from '../utils.js';
import { registerModule } from '../registry.js';
import {
  calendarConectado, conectarGoogleCalendar, desconectarGoogleCalendar,
  crearEventoCalendar, actualizarEventoCalendar, eliminarEventoCalendar,
} from '../googleCalendar.js';

let recordatorios = [];
let syncPendiente = false; // estado del checkbox "sincronizar" en el formulario

async function loadRecordatorios(){
  const { data, error } = await supabase
    .from('reminders')
    .select('*')
    .eq('user_id', state.session.user.id)
    .order('completado', { ascending: true })
    .order('fecha', { ascending: true });
  if(error){ console.error(error); return; }
  recordatorios = data || [];
}

function badgePrioridad(p){
  const map = { alta: 'badge-red', media: 'badge-amber', baja: 'badge-blue' };
  return `<span class="badge ${map[p]||'badge-gray'}">${esc(p)}</span>`;
}

function fechaLegible(r){
  const f = new Date(r.fecha + 'T00:00:00');
  const txt = f.toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' });
  return r.hora ? `${txt} · ${r.hora.slice(0,5)}` : txt;
}

function esVencido(r){
  if(r.completado) return false;
  const limite = new Date(r.fecha + 'T' + (r.hora || '23:59') + ':00');
  return limite < new Date();
}

export function renderConexionCalendar(){
  const el = document.getElementById('gcal-status');
  if(!el) return;
  if(calendarConectado()){
    el.innerHTML = `
      <div class="gcal-box gcal-on">
        <span class="gcal-dot"></span>
        <span>Conectado a Google Calendar</span>
        <button class="btn btn-soft btn-sm" onclick="desconectarCalendar()">Desconectar</button>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="gcal-box">
        <span class="gcal-dot off"></span>
        <span>No conectado</span>
        <button class="btn btn-soft btn-sm" onclick="conectarCalendar()">Conectar Google Calendar</button>
      </div>`;
  }
}

export async function conectarCalendar(){
  try{ await conectarGoogleCalendar(); renderConexionCalendar(); }
  catch(e){ console.error(e); }
}
export function desconectarCalendar(){
  desconectarGoogleCalendar();
  renderConexionCalendar();
}

export function toggleSyncCheckbox(){
  syncPendiente = document.getElementById('rec-sync').checked;
}

export async function renderRecordatorios(){
  await loadRecordatorios();
  renderConexionCalendar();

  const el = document.getElementById('lista-recordatorios');
  if(!recordatorios.length){
    el.innerHTML = '<div class="empty"><div class="empty-icon">⏰</div>No tienes recordatorios pendientes.</div>';
    return;
  }
  el.innerHTML = recordatorios.map((r, i)=>`
    <div class="list-item reminder-item prio-${esc(r.prioridad)} ${r.completado?'reminder-done':''}" style="animation-delay:${Math.min(i,10)*0.03}s">
      <div style="display:flex;align-items:flex-start;gap:10px;flex:1;min-width:0">
        <input type="checkbox" class="reminder-check" ${r.completado?'checked':''} onchange="toggleCompletado('${r.id}', this.checked)">
        <div class="list-item-left">
          <div class="list-item-name">${esc(r.titulo)}</div>
          <div class="list-item-meta">
            <span class="${esVencido(r)?'reminder-vencido':''}">${fechaLegible(r)}</span>
            ${badgePrioridad(r.prioridad)}
            ${r.google_event_id ? '<span class="badge badge-green">📅 en Calendar</span>' : ''}
          </div>
          ${r.descripcion ? `<div style="font-size:12.5px;color:var(--ink-soft);margin-top:5px;white-space:pre-wrap">${esc(r.descripcion)}</div>` : ''}
        </div>
      </div>
      <button class="btn btn-soft btn-sm" style="padding:5px 9px;color:var(--ink-soft)" onclick="eliminarRecordatorio('${r.id}')">✕</button>
    </div>`).join('');
}

export async function guardarRecordatorio(){
  const tituloEl = document.getElementById('rec-titulo');
  const descEl = document.getElementById('rec-desc');
  const fechaEl = document.getElementById('rec-fecha');
  const horaEl = document.getElementById('rec-hora');
  const prioEl = document.getElementById('rec-prioridad');

  const titulo = tituloEl.value.trim();
  const descripcion = descEl.value.trim();
  const fecha = fechaEl.value;
  const hora = horaEl.value || null;
  const prioridad = prioEl.value;

  if(!titulo){ toast('Ponle un título al recordatorio', 'err'); return; }
  if(!fecha){ toast('Elige una fecha', 'err'); return; }

  let googleEventId = null;
  if(syncPendiente){
    try{
      googleEventId = await crearEventoCalendar({ titulo, descripcion, fecha, hora });
    }catch(e){
      console.error(e);
      toast('El recordatorio se guardó, pero no se pudo sincronizar con Calendar', 'err');
    }
  }

  const { error } = await supabase.from('reminders').insert({
    user_id: state.session.user.id, titulo, descripcion, fecha, hora, prioridad,
    google_event_id: googleEventId,
  });
  if(error){ toast('No se pudo guardar el recordatorio', 'err'); console.error(error); return; }

  tituloEl.value = ''; descEl.value = ''; horaEl.value = '';
  prioEl.value = 'media';
  document.getElementById('rec-sync').checked = false;
  syncPendiente = false;

  await renderRecordatorios();
  toast(googleEventId ? 'Recordatorio guardado y agregado a Calendar ✓' : 'Recordatorio guardado ✓');
}

export async function toggleCompletado(id, completado){
  const r = recordatorios.find(x=>x.id===id);
  const { error } = await supabase.from('reminders').update({ completado }).eq('id', id);
  if(error){ toast('No se pudo actualizar', 'err'); console.error(error); return; }
  if(r?.google_event_id){
    try{ await actualizarEventoCalendar(r.google_event_id, {
      titulo: completado ? `✓ ${r.titulo}` : r.titulo, descripcion: r.descripcion, fecha: r.fecha, hora: r.hora,
    }); }catch(e){ console.error(e); }
  }
  await renderRecordatorios();
}

export async function eliminarRecordatorio(id){
  const r = recordatorios.find(x=>x.id===id);
  const { error } = await supabase.from('reminders').delete().eq('id', id);
  if(error){ toast('No se pudo eliminar', 'err'); console.error(error); return; }
  if(r?.google_event_id){
    try{ await eliminarEventoCalendar(r.google_event_id); }catch(e){ console.error(e); }
  }
  await renderRecordatorios();
  toast('Recordatorio eliminado');
}

registerModule({ id: 'recordatorios', render: renderRecordatorios });
