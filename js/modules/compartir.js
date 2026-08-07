/* ====================================================================
   modules/compartir.js — generar/revocar enlaces de invitación y
   gestionar miembros del grupo activo. No es una pestaña; se invoca
   desde el botón 🔗 del header (auth.js controla cuándo ese botón es
   visible, según el rol).
   ==================================================================== */
import { supabase } from '../config.js';
import { state } from '../state.js';
import { esc, openModal, toast } from '../utils.js';
import { requireOwner, currentGroupName } from '../auth.js';

function buildInviteLink(token){
  const base = (location.origin + location.pathname).replace(/\/$/,'').replace(/\/share\/.+$/,'');
  return `${base}/share/${token}`;
}

export async function openShareModal(){
  if(!requireOwner()) return;
  openModal(`
    <div class="modal-title">Compartir "${esc(currentGroupName())}"</div>
    <div class="modal-text">Genera un enlace para invitar a alguien. Quien lo abra deberá iniciar sesión con Google para unirse.</div>
    <div class="form-row">
      <div><label>Rol del invitado</label><select id="inv-role"><option value="viewer">Solo lectura (viewer)</option><option value="owner">Editor (owner)</option></select></div>
      <div><label>Expira en (días, opcional)</label><input type="number" id="inv-dias" min="1" placeholder="Sin expiración"></div>
    </div>
    <button class="btn btn-primary btn-block" onclick="crearInvitacion()">Generar enlace</button>
    <div id="inv-list" style="margin-top:14px"></div>
    <div class="card-title" style="margin-top:18px"><div class="card-title-text">Miembros del grupo</div></div>
    <div id="members-list"></div>
    <div class="modal-actions" style="margin-top:1rem"><button class="btn btn-soft" onclick="closeModal()">Cerrar</button></div>
  `);
  renderInvitationsList();
  renderMembersList();
}

export async function crearInvitacion(){
  const role = document.getElementById('inv-role').value;
  const dias = parseInt(document.getElementById('inv-dias').value, 10);
  const payload = { group_id: state.activeGroupId, role, created_by: state.session.user.id };
  if(dias) payload.expires_at = new Date(Date.now() + dias*86400000).toISOString();
  const { data, error } = await supabase.from('invitations').insert(payload).select().single();
  if(error){ toast('No se pudo crear la invitación','err'); console.error(error); return; }
  try{ await navigator.clipboard.writeText(buildInviteLink(data.id)); toast('Enlace copiado al portapapeles ✓'); }
  catch(e){ toast('Enlace generado ✓'); }
  renderInvitationsList();
}

async function renderInvitationsList(){
  const el = document.getElementById('inv-list');
  if(!el) return;
  const { data, error } = await supabase.from('invitations')
    .select('*').eq('group_id', state.activeGroupId).eq('revoked', false)
    .order('created_at', { ascending:false });
  if(error){ console.error(error); return; }
  if(!data || !data.length){ el.innerHTML = '<div class="empty" style="padding:10px 0">Sin enlaces activos</div>'; return; }
  el.innerHTML = data.map(inv=>{
    const link = buildInviteLink(inv.id);
    return `<div class="list-item">
      <div class="list-item-left">
        <div class="list-item-name">${inv.role==='owner' ? 'Editor' : 'Solo lectura'}</div>
        <div class="list-item-meta">${inv.expires_at ? 'Expira '+new Date(inv.expires_at).toLocaleDateString() : 'Sin expiración'}</div>
        <div class="inv-link-box">${esc(link)}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn btn-soft btn-sm" onclick="copiarEnlace('${inv.id}')">Copiar</button>
        <button class="btn btn-soft btn-sm" onclick="revocarInvitacion('${inv.id}')">Revocar</button>
      </div>
    </div>`;
  }).join('');
}

export async function copiarEnlace(id){
  try{ await navigator.clipboard.writeText(buildInviteLink(id)); toast('Enlace copiado ✓'); }
  catch(e){ toast('No se pudo copiar','err'); }
}

export async function revocarInvitacion(id){
  const { error } = await supabase.from('invitations').update({ revoked:true }).eq('id', id);
  if(error){ toast('No se pudo revocar','err'); return; }
  renderInvitationsList();
  toast('Enlace revocado');
}

async function renderMembersList(){
  const el = document.getElementById('members-list');
  if(!el) return;
  const { data, error } = await supabase.from('group_members')
    .select('user_id, role, profiles(nombres, apellidos)')
    .eq('group_id', state.activeGroupId);
  if(error){ console.error(error); return; }
  el.innerHTML = (data||[]).map(m=>{
    const nombre = m.profiles ? `${m.profiles.nombres} ${m.profiles.apellidos}` : 'Usuario';
    const esYo = m.user_id === state.session.user.id;
    return `<div class="list-item">
      <div class="list-item-left">
        <div class="list-item-name">${esc(nombre)}${esYo?' (tú)':''}</div>
        <div class="list-item-meta"><span class="badge ${m.role==='owner'?'badge-amber':'badge-gray'}">${m.role==='owner'?'Editor':'Solo lectura'}</span></div>
      </div>
      ${esYo ? '' : `<button class="btn btn-soft btn-sm" onclick="quitarMiembro('${m.user_id}')">Quitar</button>`}
    </div>`;
  }).join('');
}

export async function quitarMiembro(userId){
  const { error } = await supabase.from('group_members').delete().eq('group_id', state.activeGroupId).eq('user_id', userId);
  if(error){
    const esOrfano = (error.message||'').includes('ningún owner');
    toast(esOrfano ? error.message : 'No se pudo quitar al miembro', 'err');
    console.error(error);
    return;
  }
  renderMembersList();
  toast('Miembro eliminado del grupo');
}
