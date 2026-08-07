/* ====================================================================
   modules/ingresos.js — pestaña "Ingresos".
   ==================================================================== */
import { state } from '../state.js';
import { fmt, esc, noteHtml } from '../utils.js';
import { registerModule } from '../registry.js';

export function renderIngresos(){
  const anio = document.getElementById('filtro-anio-ing').value;
  const mes = document.getElementById('filtro-mes-ing').value;
  const q = (document.getElementById('busca-ing').value||'').toLowerCase().trim();
  let list = state.DATA.ingresos.filter(i=>
    (!anio||i.fecha.slice(0,4)===anio) &&
    (!mes||i.mes===mes) &&
    (!q||i.desc.toLowerCase().includes(q)||i.cat.toLowerCase().includes(q))
  );
  list.sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const total = list.reduce((a,i)=>a+i.monto,0);
  document.getElementById('total-ing-filtrado').textContent = fmt(total);
  const el = document.getElementById('lista-ingresos');
  if(!list.length){ el.innerHTML='<div class="empty"><div class="empty-icon">∅</div>Sin ingresos para esta selección</div>'; return; }
  el.innerHTML = list.map(i=>`
    <div class="list-item">
      <div class="list-item-left">
        <div class="list-item-name">${esc(i.desc)}</div>
        <div class="list-item-meta">${i.fecha} · <span class="badge badge-green">${esc(i.cat)}</span></div>
        ${i.obs ? `<div class="list-item-meta">${esc(i.obs)}</div>` : ''}
      </div>
      ${noteHtml(i)}
      <div style="display:flex;align-items:center;gap:8px">
        <div class="list-item-amount" style="color:var(--olive)">+${fmt(i.monto)}</div>
        ${state.currentRole==='owner' ? `<button class="btn btn-soft btn-sm" style="padding:5px 9px;color:var(--ink-soft)" onclick="confirmDelete('ingreso','${i.id}')">✕</button>` : ''}
      </div>
    </div>`).join('');
}

registerModule({ id: 'ingresos', render: renderIngresos });
