/* ====================================================================
   utils.js — funciones genéricas sin dependencias del resto de la app
   (no importan auth.js, dataLayer.js ni ningún módulo). Cualquier
   ayudante nuevo que sea puramente de formato/cálculo va aquí.
   ==================================================================== */
import { state } from './state.js';

export function fmt(n){
  n = parseFloat(n||0);
  const neg = n<0; n = Math.abs(n);
  return (neg?'-':'')+'$'+n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');
}

export function esc(s){
  return String(s==null ? '' : s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

export function getSaldoDeuda(d){
  const pagado = state.DATA.pagos.filter(p=>p.deudaId===d.id).reduce((a,p)=>a+p.monto,0);
  return d.monto - pagado;
}

export function mesActualYM(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}

export function anioReal(){ return String(new Date().getFullYear()); }

export function aniosDisponibles(){
  const set = new Set([anioReal()]);
  state.DATA.gastos.forEach(g=>set.add(g.fecha.slice(0,4)));
  state.DATA.ingresos.forEach(i=>set.add(i.fecha.slice(0,4)));
  return Array.from(set).sort((a,b)=>b.localeCompare(a));
}

export function chartColors(){
  const dark = document.documentElement.getAttribute('data-theme')==='dark';
  return {
    text: dark ? '#A89F8C' : '#6B6356',
    grid: dark ? '#3A352C' : '#E4DDC9',
    ink: dark ? '#EDE7D9' : '#2B2620'
  };
}

/* ---------- toast ---------- */
export function toast(msg, type){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type==='err' ? 'var(--terracota)' : 'var(--olive)';
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(()=>t.classList.remove('show'), 2500);
}

/* ---------- modal genérico ---------- */
export function openModal(html){
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').classList.add('show');
}
export function closeModal(){
  document.getElementById('modal-overlay').classList.remove('show');
}
