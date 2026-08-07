import { supabase } from '../config.js';
import { state } from '../state.js';
import { esc, toast } from '../utils.js';
import { registerModule } from '../registry.js';
import {
  calendarConectado, conectarGoogleCalendar, desconectarGoogleCalendar,
  crearEventoCalendar, actualizarEventoCalendar, eliminarEventoCalendar,
} from '../googleCalendar.js';

let recordatorios = [];
let syncPendiente = false;

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

function badgePrioridad(priority){
  const map = { alta: 'badge-red', media: 'badge-amber', baja: 'badge-blue' };
  return `<span class="badge ${map[priority]||'badge-gray'}">${esc(priority)}</span>`;
}

function fechaLegible(reminder){
  const date = new Date(reminder.fecha + 'T00:00:00');
  const text = date.toLocaleDateString('es', { day:'2-digit', month:'short', year:'numeric' });
  return reminder.hora ? `${text} · ${reminder.hora.slice(0,5)}` : text;
}

function esVencido(reminder){
  if(reminder.completado) return false;
  const time = reminder.hora ? String(reminder.hora).slice(0, 5) : '23:59';
  const limit = new Date(reminder.fecha + 'T' + time + ':00');
  return limit < new Date();
}

export function renderConexionCalendar(){
  const el = document.getElementById('gcal-status');
  if(!el) return;
  el.innerHTML = calendarConectado()
    ? `<div class="gcal-box gcal-on"><span class="gcal-dot"></span><span>Conectado a Google Calendar</span><button class="btn btn-soft btn-sm" onclick="desconectarCalendar()">Desconectar</button></div>`
    : `<div class="gcal-box"><span class="gcal-dot off"></span><span>No conectado</span><button class="btn btn-soft btn-sm" onclick="conectarCalendar()">Conectar Google Calendar</button></div>`;
}

export async function conectarCalendar(){
  try{ await conectarGoogleCalendar(); renderConexionCalendar(); }
  catch(error){ console.error(error); }
}

export function desconectarCalendar(){
  desconectarGoogleCalendar();
  renderConexionCalendar();
}

export function toggleSyncCheckbox(){
  syncPendiente = Boolean(document.getElementById('rec-sync')?.checked);
}

export async function renderRecordatorios(){
  await loadRecordatorios();
  renderConexionCalendar();
  const el = document.getElementById('lista-recordatorios');
  if(!recordatorios.length){
    el.innerHTML = '<div class="empty"><div class="empty-icon">⏰</div>No tienes recordatorios pendientes.</div>';
    return;
  }
  el.innerHTML = recordatorios.map((reminder, index)=>`
    <div class="list-item reminder-item prio-${esc(reminder.prioridad)} ${reminder.completado?'reminder-done':''}" style="animation-delay:${Math.min(index,10)*0.03}s">
      <div style="display:flex;align-items:flex-start;gap:10px;flex:1;min-width:0">
        <input type="checkbox" class="reminder-check" ${reminder.completado?'checked':''} onchange="toggleCompletado('${reminder.id}', this.checked)">
        <div class="list-item-left">
          <div class="list-item-name">${esc(reminder.titulo)}</div>
          <div class="list-item-meta"><span class="${esVencido(reminder)?'reminder-vencido':''}">${fechaLegible(reminder)}</span>${badgePrioridad(reminder.prioridad)}${reminder.google_event_id ? '<span class="badge badge-green">📅 en Calendar</span>' : ''}</div>
          ${reminder.descripcion ? `<div style="font-size:12.5px;color:var(--ink-soft);margin-top:5px;white-space:pre-wrap">${esc(reminder.descripcion)}</div>` : ''}
        </div>
      </div>
      <button class="btn btn-soft btn-sm" style="padding:5px 9px;color:var(--ink-soft)" onclick="eliminarRecordatorio('${reminder.id}')">×</button>
    </div>`).join('');
}

export async function guardarRecordatorio(){
  const titleEl = document.getElementById('rec-titulo');
  const descriptionEl = document.getElementById('rec-desc');
  const dateEl = document.getElementById('rec-fecha');
  const timeEl = document.getElementById('rec-hora');
  const priorityEl = document.getElementById('rec-prioridad');
  const titulo = titleEl.value.trim();
  const descripcion = descriptionEl.value.trim();
  const fecha = dateEl.value;
  const hora = timeEl.value || null;
  const prioridad = priorityEl.value;

  if(!titulo){ toast('Ponle un título al recordatorio', 'err'); return; }
  if(!fecha){ toast('Elige una fecha', 'err'); return; }

  // Primero persistimos la fila. Si Calendar falla, el recordatorio local
  // sigue disponible y no se pierde por un problema de OAuth o de red.
  const { data: created, error } = await supabase.from('reminders').insert({
    user_id: state.session.user.id, titulo, descripcion, fecha, hora, prioridad,
    google_event_id: null,
  }).select('id').single();
  if(error){ toast('No se pudo guardar el recordatorio', 'err'); console.error(error); return; }

  let googleEventId = null;
  if(syncPendiente){
    try{
      googleEventId = await crearEventoCalendar({ titulo, descripcion, fecha, hora });
      const { error: linkError } = await supabase.from('reminders')
        .update({ google_event_id: googleEventId })
        .eq('id', created.id).eq('user_id', state.session.user.id);
      if(linkError) throw linkError;
    }catch(error){
      console.error(error);
      if(googleEventId){
        try{ await eliminarEventoCalendar(googleEventId); }catch(cleanupError){ console.error(cleanupError); }
      }
      googleEventId = null;
      toast('El recordatorio se guardó, pero no se pudo sincronizar con Calendar', 'err');
    }
  }

  titleEl.value = ''; descriptionEl.value = ''; timeEl.value = '';
  priorityEl.value = 'media';
  document.getElementById('rec-sync').checked = false;
  syncPendiente = false;
  await renderRecordatorios();
  toast(googleEventId ? 'Recordatorio guardado y agregado a Calendar' : 'Recordatorio guardado');
}

export async function toggleCompletado(id, completado){
  const reminder = recordatorios.find(item=>item.id===id);
  const { error } = await supabase.from('reminders').update({ completado })
    .eq('id', id).eq('user_id', state.session.user.id);
  if(error){ toast('No se pudo actualizar', 'err'); console.error(error); return; }
  if(reminder?.google_event_id){
    try{ await actualizarEventoCalendar(reminder.google_event_id, {
      titulo: completado ? `✓ ${reminder.titulo}` : reminder.titulo,
      descripcion: reminder.descripcion, fecha: reminder.fecha, hora: reminder.hora,
    }); }catch(error){ console.error(error); toast('Se actualizó el recordatorio, pero no Calendar', 'err'); }
  }
  await renderRecordatorios();
}

export async function eliminarRecordatorio(id){
  const reminder = recordatorios.find(item=>item.id===id);
  // No borramos la fila hasta confirmar que el evento remoto fue retirado.
  if(reminder?.google_event_id){
    try{ await eliminarEventoCalendar(reminder.google_event_id); }
    catch(error){ toast('No se eliminó: no se pudo quitar el evento de Calendar', 'err'); console.error(error); return; }
  }
  const { error } = await supabase.from('reminders').delete()
    .eq('id', id).eq('user_id', state.session.user.id);
  if(error){ toast('No se pudo eliminar', 'err'); console.error(error); return; }
  await renderRecordatorios();
  toast('Recordatorio eliminado');
}

registerModule({ id: 'recordatorios', render: renderRecordatorios });
