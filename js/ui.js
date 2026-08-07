/* Control de pestañas, refresco global y filtros. */
import { state } from './state.js';
import { allModules, getModule } from './registry.js';
import { aniosDisponibles, toast } from './utils.js';
import { t } from './i18n.js';

export function showTab(id){
  const mod = getModule(id);
  if(mod?.ownerOnly && state.currentRole !== 'owner'){
    toast('Modo solo lectura: no puedes agregar registros','err');
    return;
  }
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
  document.getElementById('sec-'+id)?.classList.add('active');
  document.querySelector(`.tab[data-tab="${id}"]`)?.classList.add('active');
  mod?.render?.();
}

function currentMoveLabel(count){
  if(document.documentElement.lang==='en') return count===1 ? 'movement recorded' : 'movements recorded';
  return count===1 ? 'movimiento registrado' : 'movimientos registrados';
}

export function refresh(){
  const totalRegistros = state.DATA.gastos.length + state.DATA.ingresos.length;
  const groupName = (state.myGroups.find(g=>g.id===state.activeGroupId)||{}).name || 'Grupo';
  const headerSub = document.getElementById('header-sub');
  if(headerSub) headerSub.textContent = `${groupName} · ${totalRegistros} ${currentMoveLabel(totalRegistros)}`;

  getModule('dashboard')?.render?.();
  const activeSection = document.querySelector('.section.active');
  if(activeSection){
    const id = activeSection.id.replace(/^sec-/,'');
    if(id !== 'dashboard') getModule(id)?.render?.();
  }
}

export function poblarFiltrosDeAnio(){
  const anios = aniosDisponibles();
  const opts = anios.map(a=>`<option value="${a}">${a}</option>`).join('');
  ['filtro-anio-gas','filtro-anio-ing'].forEach(id=>{
    const sel = document.getElementById(id);
    if(!sel) return;
    const prev = sel.value;
    sel.innerHTML = `<option value="">${t('allYears')}</option>` + opts;
    sel.value = (prev && anios.includes(prev)) ? prev : '';
  });
  const selM = document.getElementById('filtro-anio-mensual');
  if(selM){
    const prevM = selM.value;
    selM.innerHTML = opts;
    selM.value = (prevM && anios.includes(prevM)) ? prevM : anios[0];
  }
}

export function applyRoleUI(){
  const isOwner = state.currentRole === 'owner';
  const banner = document.getElementById('viewer-banner');
  if(banner) banner.style.display = isOwner ? 'none' : 'flex';
  const fab = document.getElementById('fab-add');
  if(fab) fab.style.display = isOwner ? '' : 'none';
  const btnShare = document.getElementById('btn-share');
  if(btnShare) btnShare.style.display = isOwner ? '' : 'none';
  const btnCategories = document.getElementById('btn-categories');
  if(btnCategories) btnCategories.style.display = isOwner ? '' : 'none';
  allModules().filter(m=>m.ownerOnly).forEach(m=>{
    const tabEl = document.querySelector(`.tab[data-tab="${m.id}"]`);
    if(tabEl) tabEl.style.display = isOwner ? '' : 'none';
  });
  if(!isOwner){
    const activeSection = document.querySelector('.section.active');
    const ownerOnlyActive = activeSection && allModules().some(m=>m.ownerOnly && 'sec-'+m.id===activeSection.id);
    if(ownerOnlyActive) showTab('dashboard');
  }
}
