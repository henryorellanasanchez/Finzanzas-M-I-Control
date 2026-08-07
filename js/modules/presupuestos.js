/* ====================================================================
   modules/presupuestos.js — pestaña "Presupuestos".
   checkAlertasPresupuesto() se exporta porque dashboard.js la usa
   para pintar las alertas arriba del resumen.
   ==================================================================== */
import { supabase } from '../config.js';
import { state } from '../state.js';
import { fmt, esc, mesActualYM, anioReal, toast } from '../utils.js';
import { CATS_GASTO, MESES } from '../constants.js';
import { requireOwner } from '../auth.js';
import { loadAllData } from '../dataLayer.js';
import { registerModule } from '../registry.js';

function gastoCategoriaMesActual(cat){
  const ym = mesActualYM();
  return state.DATA.gastos.filter(g=>g.cat===cat && g.fecha.startsWith(ym)).reduce((a,g)=>a+g.monto,0);
}

export async function guardarPresupuesto(){
  if(!requireOwner()) return;
  const cat = document.getElementById('b-cat').value;
  const limite = parseFloat(document.getElementById('b-monto').value)||0;
  if(!limite){ toast('Ingresa un límite válido','err'); return; }
  const { error } = await supabase.from('budgets')
    .upsert({ group_id: state.activeGroupId, categoria: cat, limite, created_by: state.session.user.id }, { onConflict:'group_id,categoria' });
  if(error){ toast('No se pudo guardar el presupuesto','err'); console.error(error); return; }
  document.getElementById('b-monto').value='';
  await loadAllData();
  toast('Presupuesto guardado ✓');
}

export async function eliminarPresupuesto(id){
  if(!requireOwner()) return;
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if(error){ toast('No se pudo eliminar','err'); return; }
  await loadAllData();
}

export function renderPresupuestos(){
  document.getElementById('presu-mes-label').textContent = MESES[new Date().getMonth()] + ' ' + anioReal();
  document.getElementById('b-cat').innerHTML = Object.keys(CATS_GASTO).map(c=>`<option>${c}</option>`).join('');

  const defCard = document.getElementById('b-cat').closest('.card');
  if(defCard) defCard.style.display = state.currentRole==='owner' ? '' : 'none';

  const el = document.getElementById('lista-presupuestos');
  if(!state.DATA.presupuestos.length){
    el.innerHTML = '<div class="empty"><div class="empty-icon">◎</div>Aún no has definido presupuestos.<br>Crea uno arriba para controlar tus gastos por categoría.</div>';
    return;
  }
  el.innerHTML = state.DATA.presupuestos.map(b=>{
    const gastado = gastoCategoriaMesActual(b.cat);
    const pct = Math.min(100, Math.round(gastado/b.limite*100));
    const over = gastado > b.limite;
    const color = over ? 'var(--terracota)' : (pct>80 ? 'var(--mostaza)' : 'var(--olive)');
    return `<div class="budget-row">
      <svg class="ring-svg" width="52" height="52" viewBox="0 0 52 52">
        <circle class="ring-bg" cx="26" cy="26" r="21"></circle>
        <circle class="ring-fg" cx="26" cy="26" r="21" stroke="${color}"
          stroke-dasharray="${2*Math.PI*21}" stroke-dashoffset="${2*Math.PI*21*(1-pct/100)}"
          transform="rotate(-90 26 26)"></circle>
        <text x="26" y="30" text-anchor="middle" font-size="13" fill="var(--ink)" class="ring-center-label">${pct}%</text>
      </svg>
      <div class="budget-info">
        <div class="budget-cat">${esc(b.cat)}</div>
        <div class="budget-amounts">${fmt(gastado)} de ${fmt(b.limite)}${over?' · excedido':''}</div>
      </div>
      ${state.currentRole==='owner' ? `<button class="btn btn-soft btn-sm" onclick="eliminarPresupuesto('${b.id}')">Quitar</button>` : ''}
    </div>`;
  }).join('');
}

export function checkAlertasPresupuesto(){
  const alerts = [];
  state.DATA.presupuestos.forEach(b=>{
    const gastado = gastoCategoriaMesActual(b.cat);
    const pct = gastado/b.limite*100;
    if(gastado > b.limite){
      alerts.push({type:'danger', text:`Superaste el presupuesto de <b>${esc(b.cat)}</b>: ${fmt(gastado)} de ${fmt(b.limite)} (${Math.round(pct)}%)`});
    } else if(pct >= 80){
      alerts.push({type:'warn', text:`Vas en ${Math.round(pct)}% del presupuesto de <b>${esc(b.cat)}</b> este mes (${fmt(gastado)} de ${fmt(b.limite)})`});
    }
  });
  const zone = document.getElementById('alert-zone');
  zone.innerHTML = alerts.map(a=>`<div class="alert-banner ${a.type}">${a.type==='danger'?'⚠':'◎'} ${a.text}</div>`).join('');
}

registerModule({ id: 'presupuestos', ownerOnly: false, render: renderPresupuestos });
