/* ====================================================================
   modules/notas.js — pestaña "Notas". A propósito NO usa group_id ni
   dataLayer.js: son notas privadas del usuario, visibles solo para
   quien las escribió, sin importar si es owner o viewer del grupo
   activo. Por eso carga sus propios datos con loadNotas() en vez de
   pasar por loadAllData(). No tiene ownerOnly: true, porque cualquier
   persona —owner o viewer— gestiona sus propias notas.
   ==================================================================== */
import { supabase } from '../config.js';
import { state } from '../state.js';
import { esc, toast } from '../utils.js';
import { registerModule } from '../registry.js';

let notas = [];

async function loadNotas(){
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', state.session.user.id)
    .order('created_at', { ascending: false });
  if(error){ console.error(error); return; }
  notas = data || [];
}

export async function renderNotas(){
  await loadNotas();
  const el = document.getElementById('lista-notas');
  if(!notas.length){
    el.innerHTML = '<div class="empty"><div class="empty-icon">✎</div>Aún no tienes notas. Son privadas: nadie más en tus grupos las puede ver.</div>';
    return;
  }
  el.innerHTML = notas.map(n=>`
    <div class="list-item" style="align-items:flex-start">
      <div class="list-item-left">
        <div class="list-item-name">${esc(n.titulo || 'Sin título')}</div>
        <div class="list-item-meta">${new Date(n.created_at).toLocaleDateString()}</div>
        <div style="font-size:13px;color:var(--ink-soft);margin-top:6px;white-space:pre-wrap">${esc(n.contenido)}</div>
      </div>
      <button class="btn btn-soft btn-sm" style="padding:5px 9px;color:var(--ink-soft)" onclick="eliminarNota('${n.id}')">✕</button>
    </div>`).join('');
}

export async function guardarNota(){
  const tituloEl = document.getElementById('nota-titulo');
  const contenidoEl = document.getElementById('nota-contenido');
  const titulo = tituloEl.value.trim();
  const contenido = contenidoEl.value.trim();
  if(!contenido){ toast('Escribe algo en la nota','err'); return; }
  const { error } = await supabase.from('notes')
    .insert({ user_id: state.session.user.id, titulo, contenido });
  if(error){ toast('No se pudo guardar la nota','err'); console.error(error); return; }
  tituloEl.value = '';
  contenidoEl.value = '';
  await renderNotas();
  toast('Nota guardada ✓');
}

export async function eliminarNota(id){
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if(error){ toast('No se pudo eliminar','err'); console.error(error); return; }
  await renderNotas();
  toast('Nota eliminada');
}

registerModule({ id: 'notas', render: renderNotas });
