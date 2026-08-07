/* ====================================================================
   modules/mensual.js — pestaña "Mensual" (tabla + barra por año).
   ==================================================================== */
import { state } from '../state.js';
import { fmt, anioReal, chartColors } from '../utils.js';
import { monthlyTotals } from '../finance.js';
import { MESES, MESES_KEYS } from '../constants.js';
import { registerModule } from '../registry.js';

export function renderMensual(){
  const anio = document.getElementById('filtro-anio-mensual').value || anioReal();
  document.getElementById('mensual-anio-label').textContent = anio;
  const tbody = document.getElementById('tabla-mensual');
  let acum = 0;
  const ingPorMes = [], gasPorMes = [], pagosPorMes = [], cobrosPorMes = [];
  tbody.innerHTML = MESES.map((m,i)=>{
    const k = MESES_KEYS[i];
    const { ing, gas, pagosDeuda: deudaPagos, cobrosDeuda, saldo } = monthlyTotals(state.DATA, anio+'-'+k);
    acum += saldo;
    ingPorMes.push(ing); gasPorMes.push(gas); pagosPorMes.push(deudaPagos); cobrosPorMes.push(cobrosDeuda);
    if(ing===0&&gas===0&&deudaPagos===0&&cobrosDeuda===0) return `<tr><td style="color:var(--ink-faint)">${m}</td><td colspan="5" style="color:var(--ink-faint);text-align:center;font-size:11px">—</td></tr>`;
    const deudaTexto = [
      deudaPagos ? `−${fmt(deudaPagos)}` : '',
      cobrosDeuda ? `+${fmt(cobrosDeuda)}` : ''
    ].filter(Boolean).join(' · ') || '—';
    return `<tr>
      <td>${m}</td>
      <td style="text-align:right;color:var(--olive)">${fmt(ing)}</td>
      <td style="text-align:right;color:var(--terracota)">${fmt(gas)}</td>
      <td style="text-align:right;color:${cobrosDeuda&&!deudaPagos?'var(--olive)':'var(--azul)'}">${deudaTexto}</td>
      <td style="text-align:right;font-weight:600;color:${saldo>=0?'var(--olive)':'var(--terracota)'}">${fmt(saldo)}</td>
      <td style="text-align:right;color:${acum>=0?'var(--olive)':'var(--terracota)'}">${fmt(acum)}</td>
    </tr>`;
  }).join('');

  const cc = chartColors();
  const ctx = document.getElementById('chart-mensual-bar').getContext('2d');
  if(state.charts.mensualBar) state.charts.mensualBar.destroy();
  state.charts.mensualBar = new Chart(ctx, {
    type:'bar',
    data:{
      labels: MESES.map(m=>m.slice(0,3)),
      datasets:[
        {label:'Ingresos', data:ingPorMes, backgroundColor:'#5C7A52', borderRadius:4},
        {label:'Gastos', data:gasPorMes, backgroundColor:'#C1603F', borderRadius:4},
        {label:'Pagos de deuda', data:pagosPorMes, backgroundColor:'#49758C', borderRadius:4},
        {label:'Cobros de deuda', data:cobrosPorMes, backgroundColor:'#B58736', borderRadius:4}
      ]
    },
    options:{
      plugins:{ legend:{position:'bottom', labels:{color:cc.text, font:{family:"'Inter'",size:11}, boxWidth:10, padding:8}} },
      scales:{
        y:{ grid:{color:cc.grid}, ticks:{color:cc.text, font:{family:"'IBM Plex Mono'",size:10}, callback:v=>'$'+v} },
        x:{ grid:{display:false}, ticks:{color:cc.text, font:{family:"'Inter'",size:11}} }
      }
    }
  });
}

registerModule({ id: 'mensual', render: renderMensual });
