/* ====================================================================
   modules/deudas.js — pestaña "Deudas" (deudas activas + historial de
   pagos). Es solo lectura visual; crear deuda/registrar pago vive en
   modules/agregar.js, junto con gastos e ingresos.
   ==================================================================== */
import { state } from '../state.js';
import { fmt, esc, getSaldoDeuda, noteHtml } from '../utils.js';
import { registerModule } from '../registry.js';

export function renderDeudas(){
  const el = document.getElementById('lista-deudas');
  if(!state.DATA.deudas.length){ el.innerHTML='<div class="empty">Sin deudas registradas</div>'; return; }
  el.innerHTML = state.DATA.deudas.map(d=>{
    const pagado = state.DATA.pagos.filter(p=>p.deudaId===d.id).reduce((a,p)=>a+p.monto,0);
    const saldo = d.monto-pagado;
    const pct = Math.min(100,Math.round(pagado/d.monto*100));
    const saldada = saldo<=0;
    return `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-size:14px;font-weight:600">${esc(d.persona)} — ${esc(d.concepto)}</div>
          <div style="font-size:12px;color:var(--ink-soft);margin-top:3px">${esc(d.obs||'')}</div>
          ${noteHtml(d)}
        </div>
        <span class="badge ${saldada?'badge-green':'badge-red'}">${saldada?'Saldada':'Pendiente'}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">
        <div><div style="font-size:11px;color:var(--ink-soft)">Monto inicial</div><div style="font-weight:600;font-size:14px;font-family:var(--font-mono)">${fmt(d.monto)}</div></div>
        <div><div style="font-size:11px;color:var(--ink-soft)">Pagado</div><div style="font-weight:600;font-size:14px;font-family:var(--font-mono);color:var(--olive)">${fmt(pagado)}</div></div>
        <div><div style="font-size:11px;color:var(--ink-soft)">Saldo</div><div style="font-weight:600;font-size:14px;font-family:var(--font-mono);color:${saldada?'var(--olive)':'var(--terracota)'}">${fmt(Math.max(0,saldo))}</div></div>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${saldada?'var(--olive)':'var(--mostaza)'}"></div></div>
      <div style="font-size:11px;color:var(--ink-soft);margin-top:4px">${pct}% pagado${d.cuota?` · cuota fija ${fmt(d.cuota)}/mes`:''}</div>
    </div>`;
  }).join('');

  const hp = document.getElementById('historial-pagos');
  const pagosSort = [...state.DATA.pagos].sort((a,b)=>b.fecha.localeCompare(a.fecha));
  if(!pagosSort.length){ hp.innerHTML='<div class="empty">Sin pagos registrados</div>'; return; }
  hp.innerHTML = pagosSort.map(p=>{
    const d = state.DATA.deudas.find(x=>x.id===p.deudaId);
    return `<div class="list-item">
      <div class="list-item-left">
        <div class="list-item-name">${d?esc(d.persona):'?'} — ${d?esc(d.concepto):'?'}</div>
        <div class="list-item-meta">${p.fecha} · ${esc(p.metodo)}</div>
      </div>
      <div class="list-item-amount" style="color:var(--azul)">−${fmt(p.monto)}</div>
    </div>`;
  }).join('');
}

registerModule({ id: 'deudas', render: renderDeudas });
