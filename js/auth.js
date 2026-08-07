/* ====================================================================
   auth.js — login con Google, perfil (Nombres/Apellidos), grupos de
   finanzas, cambio de grupo activo y permisos owner/viewer.
   ==================================================================== */
import { supabase, APP_PUBLIC_URL } from './config.js';
import { state } from './state.js';
import { esc, toast, openModal } from './utils.js';
import { applyRoleUI } from './ui.js';
import { loadAllData } from './dataLayer.js';
import { loadCategories } from './categories.js';

/* ---------- token de invitación en la URL ---------- */
export function getInviteTokenFromURL(){
  const m = window.location.pathname.match(/\/share\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/i);
  const candidate = m ? m[1] : new URLSearchParams(window.location.search).get('invite');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate||'') ? candidate : null;
}

/* ---------- pantalla de autenticación (overlay de toda la página) ---------- */
export function showAuthScreen(mode, extra){
  document.getElementById('app-root').style.display = 'none';
  const gate = document.getElementById('auth-gate');
  gate.style.display = 'flex';

  if(mode==='loading'){
    gate.innerHTML = `<div class="auth-card"><div class="auth-spinner"></div><div class="auth-msg">Cargando…</div></div>`;
  } else if(mode==='login'){
    gate.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand"><img src="./icons/mi-control.png" alt="M&amp;I Control"></div>
        <div class="auth-title">M&amp;I Control</div>
        <div class="auth-kicker">M&amp;I CONTROL · FINANZAS COMPARTIDAS</div>
        <div class="auth-msg">${extra ? esc(extra) : 'Inicia sesión con tu cuenta de Google para continuar.'}</div>
        <button class="btn btn-primary btn-block" onclick="loginWithGoogle()">Continuar con Google</button>
      </div>`;
  } else if(mode==='profile'){
    gate.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand auth-brand-small"><img src="./icons/mi-control.png" alt="M&amp;I Control"></div>
        <div class="auth-title">Completa tu perfil</div>
        <div class="auth-msg">Necesitamos tu nombre para identificarte dentro de tus grupos de finanzas.</div>
        <div class="form-row">
          <div><label>Nombres</label><input type="text" id="prof-nombres" placeholder="Ej: María"></div>
          <div><label>Apellidos</label><input type="text" id="prof-apellidos" placeholder="Ej: Gómez"></div>
        </div>
        <button class="btn btn-primary btn-block" onclick="saveProfileAndContinue()">Continuar</button>
      </div>`;
  } else if(mode==='error'){
    gate.innerHTML = `
      <div class="auth-card">
        <div class="auth-title">Algo salió mal</div>
        <div class="auth-msg">${esc(extra||'Ocurrió un error inesperado.')}</div>
        <button class="btn btn-soft btn-block" onclick="location.href=location.origin+location.pathname.replace(/\\/share\\/.+$/,'')">Volver al inicio</button>
      </div>`;
  }
}
export function hideAuthScreen(){
  document.getElementById('auth-gate').style.display = 'none';
  document.getElementById('app-root').style.display = 'block';
}

/* ---------- login / logout ---------- */
export async function loginWithGoogle(){
  const token = getInviteTokenFromURL();
  if(token){
    try{ sessionStorage.setItem('pending_invite_token', token); }catch(error){ console.warn('No se pudo conservar la invitación', error); }
  }
  const isLocal = ['localhost','127.0.0.1'].includes(window.location.hostname);
  const cleanBase = isLocal
    ? window.location.origin + window.location.pathname.replace(/\/share\/.+$/,'')
    : APP_PUBLIC_URL;
  await supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo: cleanBase } });
}
export async function logout(){
  await supabase.auth.signOut();
  location.href = location.origin + location.pathname.replace(/\/share\/.+$/,'');
}

/* ---------- perfil ---------- */
export async function ensureProfile(){
  const { data, error } = await supabase.from('profiles').select('*').eq('id', state.session.user.id).maybeSingle();
  if(error) console.error(error);
  if(data){
    if(!data.email && state.session.user.email){
      const { data: updated } = await supabase.from('profiles')
        .update({ email: state.session.user.email })
        .eq('id', state.session.user.id)
        .select().single();
      state.myProfile = updated || data;
    } else state.myProfile = data;
    return true;
  }
  return false;
}

export async function saveProfileAndContinue(){
  const nombres = document.getElementById('prof-nombres').value.trim();
  const apellidos = document.getElementById('prof-apellidos').value.trim();
  if(!nombres || !apellidos){ toast('Completa nombres y apellidos','err'); return; }
  const { data, error } = await supabase.from('profiles')
    .insert({ id: state.session.user.id, nombres, apellidos, email: state.session.user.email || '' }).select().single();
  if(error){ toast('No se pudo guardar tu perfil','err'); console.error(error); return; }
  state.myProfile = data;
  await afterProfileReady();
}

/* ---------- invitaciones (aceptar) ---------- */
async function acceptPendingInviteIfAny(){
  let token = null;
  try{ token = sessionStorage.getItem('pending_invite_token'); }catch(error){ console.warn(error); }
  if(!token){
    try{ token = localStorage.getItem('pending_invite_token'); }catch(error){ console.warn(error); }
  }
  if(!token) return null;
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token });
  if(error){ toast('La invitación no es válida o ya expiró','err'); console.error(error); return null; }
  try{ sessionStorage.removeItem('pending_invite_token'); localStorage.removeItem('pending_invite_token'); }catch(cleanupError){ console.warn(cleanupError); }
  return (data && data[0]) ? data[0].group_id : null;
}

/* ---------- grupos ---------- */
async function loadMyGroups(){
  const { data, error } = await supabase
    .from('group_members')
    .select('role, group_id, finance_groups(id, name, owner_id)')
    .eq('user_id', state.session.user.id);
  if(error){ console.error(error); return []; }
  return (data||[])
    .filter(r=>r.finance_groups)
    .map(r=>({
      id:r.group_id,
      name:r.finance_groups.owner_id === state.session.user.id
        ? r.finance_groups.name
        : `Compartidas · ${r.finance_groups.name}`,
      role:r.role
    }));
}

async function bootstrapPersonalGroup(){
  // Si el primer intento llegó a insertar el grupo pero falló al devolverlo
  // por RLS, reutilizamos ese grupo en vez de crear duplicados.
  const { data: existing, error: lookupError } = await supabase.from('finance_groups')
    .select('id, name, owner_id')
    .eq('owner_id', state.session.user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if(lookupError){ console.error(lookupError); throw lookupError; }

  let group = existing;
  if(!group){
    const { data: created, error: e1 } = await supabase.from('finance_groups')
      .insert({ name:'Mis finanzas', owner_id: state.session.user.id }).select('id, name, owner_id').single();
    if(e1){ console.error(e1); throw e1; }
    group = created;
  }
  const { error: e2 } = await supabase.from('group_members')
    .insert({ group_id: group.id, user_id: state.session.user.id, role:'owner' });
  if(e2 && e2.code !== '23505'){ console.error(e2); throw e2; }
  return { id: group.id, name: group.name, role:'owner' };
}

export async function afterProfileReady(){
  showAuthScreen('loading');
  try{
    const joinedGroupId = await acceptPendingInviteIfAny();
    state.myGroups = await loadMyGroups();
    if(!state.myGroups.some(g=>g.role==='owner')){
      state.myGroups.unshift(await bootstrapPersonalGroup());
    }
    const saved = localStorage.getItem('active_group_id');
    const initialGroupId = (joinedGroupId && state.myGroups.some(g=>g.id===joinedGroupId)) ? joinedGroupId
      : (saved && state.myGroups.some(g=>g.id===saved)) ? saved
      : state.myGroups[0].id;
    await setActiveGroup(initialGroupId);
    state.appBootstrapped = true;
    hideAuthScreen();
  }catch(e){
    console.error(e);
    showAuthScreen('error', 'No se pudieron cargar tus grupos de finanzas. Intenta recargar la página.');
  }
}

export async function setActiveGroup(groupId){
  state.activeGroupId = groupId;
  localStorage.setItem('active_group_id', groupId);
  state.currentRole = (state.myGroups.find(g=>g.id===groupId)||{}).role || 'viewer';
  renderGroupSwitcher();
  applyRoleUI();
  await loadCategories();
  await loadAllData();
}

export function renderGroupSwitcher(){
  const sel = document.getElementById('group-switcher');
  if(!sel) return;
  sel.style.display = state.myGroups.length > 1 ? '' : 'none';
  sel.innerHTML = state.myGroups.map(g=>
    `<option value="${g.id}" ${g.id===state.activeGroupId?'selected':''}>${esc(g.name)}${g.role==='viewer'?' (lectura)':''}</option>`
  ).join('');
}
export function onGroupSwitch(){
  setActiveGroup(document.getElementById('group-switcher').value);
}
export function currentGroupName(){
  return (state.myGroups.find(g=>g.id===state.activeGroupId)||{}).name || 'Grupo';
}

/* ---------- permisos ---------- */
export function requireOwner(){
  if(state.currentRole!=='owner'){ toast('Modo solo lectura: no puedes editar estos datos','err'); return false; }
  return true;
}

/* ---------- modal de cuenta ---------- */
export function openAccountModal(){
  if(!state.myProfile) return;
  openModal(`
    <div class="modal-title">${esc(state.myProfile.nombres)} ${esc(state.myProfile.apellidos)}</div>
    <div class="modal-text">${esc(state.session.user.email||'')}</div>
    <div class="modal-actions">
      <button class="btn btn-soft" onclick="closeModal()">Cerrar</button>
      <button class="btn btn-danger" onclick="logout()">Cerrar sesión</button>
    </div>
  `);
}

/* ---------- arranque del flujo de autenticación ---------- */
async function handleAuthReady(){
  if(!state.session){
    state.appBootstrapped = false;
    const token = getInviteTokenFromURL();
    showAuthScreen('login', token ? 'Te invitaron a un grupo de finanzas compartido. Inicia sesión con Google para aceptar la invitación.' : null);
    return;
  }
  const hasProfile = await ensureProfile();
  if(!hasProfile){ showAuthScreen('profile'); return; }
  await afterProfileReady();
}

export function initAuth(){
  showAuthScreen('loading');
  supabase.auth.onAuthStateChange((event, sess)=>{
    state.session = sess;
    if(event==='SIGNED_OUT'){
      state.appBootstrapped = false;
      location.href = location.origin + location.pathname.replace(/\/share\/.+$/,'');
      return;
    }
    if(event==='INITIAL_SESSION' || event==='SIGNED_IN'){
      handleAuthReady();
    }
  });
}
