/* ====================================================================
   modules/dashboard.js — pestaña "Resumen". Totales históricos del
   grupo activo (no se filtra por año: es un acumulado de toda la vida
   del grupo).
   ==================================================================== */
import { state } from '../state.js';
import { fmt, esc, getSaldoDeuda, chartColors } from '../utils.js';
import { MESES, CAT_COLORS } from '../constants.js';
import { registerModule } from '../registry.js';
import { checkAlertasPresupuesto } from './presupuestos.js';

function calcKPIs(){
  const ing = state.DATA.ingresos.reduce((a,i)=>a+i.monto,0);
  const gas = state.DATA.gastos.reduce((a,g)=>a+g.monto,0);
  const pagDeuda = state.DATA.pagos.reduce((a,p)=>a+p.monto,0);
  const totalDeudas = state.DATA.deudas.reduce((a,d)=>a+Math.max(0,getSaldoDeuda(d)),0);
  return { ing, gas, pagDeuda, totalDeudas, neto: ing-gas };
}

function renderDonutChart(){
  const byCategoria = {};
  state.DATA.gastos.forEach(g=>{ byCategoria[g.cat]=(byCategoria[g.cat]||0)+g.monto; });
  const cats = Object.keys(byCategoria).sort((a,b)=>byCategoria[b]-byCategoria[a]);
  const total = cats.reduce((a,c)=>a+byCategoria[c],0);
  document.getElementById('donut-total').textContent = fmt(total)+' total';

  const wrap = document.getElementById('chart-donut-wrap');
  if(!wrap) return;
  if(!cats.length){
    state.charts.donut?.destroy();
    state.charts.donut = null;
    wrap.innerHTML = '<div class="empty">Sin gastos registrados</div>';
    return;
  }
  if(!document.getElementById('chart-donut')) wrap.innerHTML = '<canvas id="chart-donut"></canvas>';
  if(!window.Chart) return;

  const ctx = document.getElementById('chart-donut').getContext('2d');
  const cc = chartColors();
  if(state.charts.donut) state.charts.donut.destroy();
  state.charts.donut = new Chart(ctx, {
    type:'doughnut',
    data:{
      labels: cats,
      datasets:[{
        data: cats.map(c=>byCategoria[c]),
        backgroundColor: cats.map(c=>CAT_COLORS[c]||'#9A8F7A'),
        borderWidth:2,
        borderColor: document.documentElement.getAttribute('data-theme')==='dark' ? '#242220' : '#FFFFFF'
      }]
    },
    options:{
      cutout:'62%',
      plugins:{
        legend:{ position:'bottom', labels:{ color:cc.text, font:{family:"'Inter'",size:11}, boxWidth:10, padding:8 } },
        tooltip:{ callbacks:{ label: (c)=> ` ${c.label}: ${fmt(c.parsed)}` } }
      }
    }
  });
}

function renderTrendChart(){
  const allYM = new Set();
  state.DATA.ingresos.forEach(i=>allYM.add(i.fecha.slice(0,7)));
  state.DATA.gastos.forEach(g=>allYM.add(g.fecha.slice(0,7)));
  const yms = Array.from(allYM).sort();

  const label = document.getElementById('trend-year-label');
  if(label){
    label.textContent = !yms.length ? 'Histórico'
      : (yms[0].slice(0,4)===yms[yms.length-1].slice(0,4) ? yms[0].slice(0,4) : `${yms[0].slice(0,4)}–${yms[yms.length-1].slice(0,4)}`);
  }

  const wrap = document.getElementById('chart-trend-wrap');
  if(!wrap) return;
  if(!yms.length){
    state.charts.trend?.destroy();
    state.charts.trend = null;
    wrap.innerHTML = '<div class="empty">Sin movimientos registrados</div>';
    return;
  }
  if(!document.getElementById('chart-trend')) wrap.innerHTML = '<canvas id="chart-trend"></canvas>';
  if(!window.Chart) return;

  const ingPorYM = yms.map(ym=>state.DATA.ingresos.filter(i=>i.fecha.startsWith(ym)).reduce((a,i)=>a+i.monto,0));
  const gasPorYM = yms.map(ym=>state.DATA.gastos.filter(g=>g.fecha.startsWith(ym)).reduce((a,g)=>a+g.monto,0));
  const labels = yms.map(ym=>{
    const [y,m]=ym.split('-');
    return MESES[parseInt(m,10)-1].slice(0,3)+" '"+y.slice(2);
  });

  const cc = chartColors();
  const ctx = document.getElementById('chart-trend').getContext('2d');
  if(state.charts.trend) state.charts.trend.destroy();
  state.charts.trend = new Chart(ctx, {
    type:'line',
    data:{
      labels,
      datasets:[
        { label:'Ingresos', data: ingPorYM, borderColor:'#5C7A52', backgroundColor:'rgba(92,122,82,.12)', fill:true, tension:.35, pointRadius:3 },
        { label:'Gastos', data: gasPorYM, borderColor:'#C1603F', backgroundColor:'rgba(193,96,63,.12)', fill:true, tension:.35, pointRadius:3 }
      ]
    },
    options:{
      plugins:{ legend:{ position:'bottom', labels:{ color:cc.text, font:{family:"'Inter'",size:11}, boxWidth:10, padding:8 } },
        tooltip:{ callbacks:{ label:(c)=>` ${c.dataset.label}: ${fmt(c.parsed.y)}` } } },
      scales:{
        y:{ grid:{color:cc.grid}, ticks:{color:cc.text, font:{family:"'IBM Plex Mono'",size:10}, callback:v=>'$'+v} },
        x:{ grid:{display:false}, ticks:{color:cc.text, font:{family:"'Inter'",size:11}} }
      }
    }
  });
}

export function renderDashboard(){
  const k = calcKPIs();
  const grid = document.getElementById('kpi-grid');
  const mesesConDatos = new Set([
    ...state.DATA.ingresos.map(i=>i.fecha.slice(0,7)),
    ...state.DATA.gastos.map(g=>g.fecha.slice(0,7))
  ]).size || 1;
  grid.innerHTML = `
    <div class="kpi"><div class="kpi-label">Total ingresos</div><div class="kpi-val green">${fmt(k.ing)}</div><div class="kpi-delta">~${fmt(k.ing/mesesConDatos)}/mes</div></div>
    <div class="kpi"><div class="kpi-label">Total gastos</div><div class="kpi-val red">${fmt(k.gas)}</div><div class="kpi-delta">~${fmt(k.gas/mesesConDatos)}/mes</div></div>
    <div class="kpi"><div class="kpi-label">Balance neto</div><div class="kpi-val ${k.neto>=0?'green':'red'}">${fmt(k.neto)}</div><div class="kpi-delta">${k.neto>=0?'Ahorro acumulado':'Déficit acumulado'}</div></div>
    <div class="kpi"><div class="kpi-label">Deudas pendientes</div><div class="kpi-val amber">${fmt(k.totalDeudas)}</div><div class="kpi-delta">${state.DATA.deudas.filter(d=>getSaldoDeuda(d)>0).length} activa(s)</div></div>
  `;

  checkAlertasPresupuesto();
  renderDonutChart();
  renderTrendChart();

  const bp = document.getElementById('bank-progress');
  const activas = state.DATA.deudas.filter(d=>getSaldoDeuda(d)>0);
  if(!activas.length){
    bp.innerHTML = '<div class="empty">🎉 No tienes deudas pendientes</div>';
  } else {
    bp.innerHTML = activas.map(d=>{
      const saldo = getSaldoDeuda(d);
      const pct = Math.min(100,Math.round((d.monto-saldo)/d.monto*100));
      return `<div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:5px">
          <span>${esc(d.persona)} — ${esc(d.concepto)}</span>
          <span style="color:var(--terracota);font-family:var(--font-mono)">${fmt(saldo)}</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:var(--mostaza)"></div></div>
        <div style="font-size:11px;color:var(--ink-soft);margin-top:3px">${pct}% pagado${d.cuota?` · cuota ${fmt(d.cuota)}/mes`:''}</div>
      </div>`;
    }).join('');
  }

  const all=[
    ...state.DATA.gastos.map(g=>({tipo:'gasto',fecha:g.fecha,label:g.desc,sub:g.cat,monto:-g.monto})),
    ...state.DATA.ingresos.map(i=>({tipo:'ingreso',fecha:i.fecha,label:i.desc,sub:i.cat,monto:i.monto})),
    ...state.DATA.pagos.map(p=>{const d=state.DATA.deudas.find(x=>x.id===p.deudaId);return {tipo:'pago',fecha:p.fecha,label:'Pago a '+(d?d.persona:'?'),sub:d?d.concepto:'',monto:-p.monto};})
  ].sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,8);
  const rl = document.getElementById('recent-list');
  if(!all.length){ rl.innerHTML='<div class="empty">Sin movimientos aún</div>'; return; }
  rl.innerHTML = all.map(r=>`
    <div class="list-item">
      <div class="list-item-left">
        <div class="list-item-name">${esc(r.label)}</div>
        <div class="list-item-meta">${r.fecha} · <span class="badge ${r.tipo==='ingreso'?'badge-green':r.tipo==='pago'?'badge-blue':'badge-gray'}">${esc(r.sub)}</span></div>
      </div>
      <div class="list-item-amount" style="color:${r.monto>=0?'var(--olive)':'var(--terracota)'}">${r.monto>=0?'+':'−'}${fmt(Math.abs(r.monto))}</div>
    </div>`).join('');
}

registerModule({ id: 'dashboard', render: renderDashboard });
