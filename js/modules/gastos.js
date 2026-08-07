/* ====================================================================
   modules/gastos.js — pestaña "Gastos".
   ==================================================================== */
import { state } from '../state.js';
import { fmt, esc } from '../utils.js';
import { CAT_COLORS } from '../constants.js';
import { registerModule } from '../registry.js';

export function renderGastos(){
  const anio = document.getElementById('filtro-anio-gas').value;
  const mes = document.getElementById('filtro-mes-gas').value;
  const cat = document.getElementById('filtro-cat-gas').value;
  const q = (document.getElementById('busca-gas').value||'').toLowerCase().trim();
  let list = state.DATA.gastos.filter(g=>
    (!anio||g.fecha.slice(0,4)===anio) &&
    (!mes||g.mes===mes) &&
    (!cat||g.cat===cat) &&
    (!q||g.desc.toLowerCase().includes(q)||g.sub.toLowerCase().includes(q)||g.cat.toLowerCase().includes(q))
  );
  list.sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const total = list.reduce((a,g)=>a+g.monto,0);
  document.getElementById('total-gas-filtrado').textContent = fmt(total);

  const byCat = {};
  list.forEach(g=>{ byCat[g.cat]=(byCat[g.cat]||0)+g.monto; });
  const stripEl = document.getElementById('gastos-cat-strip');
  const sortedCats = Object.keys(byCat).sort((a,b)=>byCat[b]-byCat[a]);
  stripEl.innerHTML = sortedCats.map(c=>`
    <div class="stat-chip" style="border-bottom:2px solid ${CAT_COLORS[c]||'#9A8F7A'}">
      <div class="stat-chip-val">${fmt(byCat[c])}</div>
      <div class="stat-chip-label">${esc(c)}</div>
    </div>`).join('');

  const el = document.getElementById('lista-gastos');
  if(!list.length){ el.innerHTML='<div class="empty"><div class="empty-icon">∅</div>Sin gastos para esta selección</div>'; return; }
  el.innerHTML = list.map(g=>`
    <div class="list-item">
      <div class="list-item-left">
        <div class="list-item-name">${esc(g.desc)}</div>
        <div class="list-item-meta">${g.fecha} · <span class="badge badge-gray">${esc(g.cat)}</span> <span class="badge badge-gray">${esc(g.sub)}</span> · ${esc(g.metodo)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div class="list-item-amount" style="color:var(--terracota)">−${fmt(g.monto)}</div>
        ${state.currentRole==='owner' ? `<button class="btn btn-soft btn-sm" style="padding:5px 9px;color:var(--ink-soft)" onclick="confirmDelete('gasto','${g.id}')">✕</button>` : ''}
      </div>
    </div>`).join('');
}

registerModule({ id: 'gastos', render: renderGastos });
