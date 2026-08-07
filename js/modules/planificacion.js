/* Planificación: metas, cuentas, recurrencias y proyección de efectivo. */
import { supabase } from '../config.js';
import { state } from '../state.js';
import { esc, fechaLocalISO, fechaISOValida, fmt, getSaldoDeuda, toast } from '../utils.js';
import { positiveAmount, accountBalances, financialSummary, goalProgress, projectCashFlow, recurringDateForMonth, recurringForMonth } from '../finance.js';
import { loadAllData } from '../dataLayer.js';
import { requireOwner } from '../auth.js';
import { registerModule } from '../registry.js';
import { getCategories } from '../categories.js';

let applyingRecurring = false;

function accountOptions(selected = ''){
  return ['<option value="">Sin cuenta asignada</option>', ...state.DATA.cuentas.map(account=>`<option value="${account.id}" ${account.id===selected?'selected':''}>${esc(account.name)} · ${esc(account.type)}</option>`)].join('');
}

function activeBalance(){
  const opening = state.DATA.cuentas.reduce((total, account)=>total+(Number(account.openingBalance)||0),0);
  return opening + financialSummary(state.DATA, getSaldoDeuda).net;
}

function monthsUntil(date){
  if(!date) return null;
  const now = new Date();
  const target = new Date(`${date}T12:00:00`);
  return Math.max(0, (target.getFullYear()-now.getFullYear())*12 + target.getMonth()-now.getMonth() + (target.getDate() >= now.getDate() ? 1 : 0));
}

async function sync(message){
  const ok = await loadAllData();
  toast(ok ? message : `${message} La sincronización se reintentará al recuperar la conexión.`, ok ? undefined : 'err');
}

export async function guardarCuenta(){
  if(!requireOwner()) return;
  const name = document.getElementById('cuenta-nombre').value.trim();
  const openingText = document.getElementById('cuenta-saldo-inicial').value;
  const openingBalance = openingText === '' ? 0 : Number(openingText);
  if(!name || !Number.isFinite(openingBalance)){ toast('Completa el nombre y un saldo inicial válido','err'); return; }
  try{
    const { error } = await supabase.from('financial_accounts').insert({
      group_id:state.activeGroupId, created_by:state.session.user.id, name,
      type:document.getElementById('cuenta-tipo').value, opening_balance:openingBalance
    });
    if(error) throw error;
    document.getElementById('cuenta-nombre').value='';
    document.getElementById('cuenta-saldo-inicial').value='';
    await sync('Cuenta creada ✓');
  }catch(error){ console.error(error); toast('No se pudo crear la cuenta. Ejecuta primero la actualización SQL de planificación.','err'); }
}

export async function conciliarCuenta(id){
  if(!requireOwner()) return;
  const account = state.DATA.cuentas.find(item=>item.id===id);
  if(!account) return;
  const value = window.prompt(`Saldo real actual de “${account.name}”:`, String(account.reconciledBalance ?? account.openingBalance));
  if(value === null) return;
  const balance = Number(value);
  if(!Number.isFinite(balance)){ toast('Ingresa un saldo válido','err'); return; }
  try{
    const { error } = await supabase.from('financial_accounts').update({ reconciled_balance:balance, reconciled_at:fechaLocalISO() }).eq('id', id);
    if(error) throw error;
    await sync('Cuenta conciliada ✓');
  }catch(error){ console.error(error); toast('No se pudo conciliar la cuenta','err'); }
}

export async function eliminarCuenta(id){
  if(!requireOwner() || !window.confirm('¿Eliminar esta cuenta? Los movimientos quedarán sin cuenta asignada.')) return;
  try{
    const { error } = await supabase.from('financial_accounts').delete().eq('id', id);
    if(error) throw error;
    await sync('Cuenta eliminada');
  }catch(error){ console.error(error); toast('No se pudo eliminar la cuenta','err'); }
}

export async function guardarMeta(){
  if(!requireOwner()) return;
  const title = document.getElementById('meta-titulo').value.trim();
  const targetAmount = positiveAmount(document.getElementById('meta-objetivo').value);
  const initialText = document.getElementById('meta-inicial').value;
  const initialAmount = initialText === '' ? 0 : Number(initialText);
  const targetDate = document.getElementById('meta-fecha').value || null;
  if(!title || !targetAmount || !Number.isFinite(initialAmount) || initialAmount < 0){ toast('Completa una meta y montos válidos','err'); return; }
  if(targetDate && !fechaISOValida(targetDate)){ toast('Ingresa una fecha objetivo válida','err'); return; }
  try{
    const { error } = await supabase.from('financial_goals').insert({
      group_id:state.activeGroupId, created_by:state.session.user.id, title,
      target_amount:targetAmount, initial_amount:initialAmount, target_date:targetDate
    });
    if(error) throw error;
    ['meta-titulo','meta-objetivo','meta-inicial','meta-fecha'].forEach(id=>document.getElementById(id).value='');
    await sync('Meta de ahorro creada ✓');
  }catch(error){ console.error(error); toast('No se pudo crear la meta. Ejecuta primero la actualización SQL de planificación.','err'); }
}

export async function aportarMeta(id){
  if(!requireOwner()) return;
  const goal = state.DATA.metas.find(item=>item.id===id);
  if(!goal) return;
  const value = window.prompt(`Aporte para “${goal.title}”:`, '');
  if(value === null) return;
  const amount = positiveAmount(value);
  if(!amount){ toast('Ingresa un aporte positivo','err'); return; }
  try{
    const { error } = await supabase.from('goal_contributions').insert({
      goal_id:id, group_id:state.activeGroupId, created_by:state.session.user.id, amount, fecha:fechaLocalISO()
    });
    if(error) throw error;
    await sync('Aporte registrado ✓');
  }catch(error){ console.error(error); toast('No se pudo registrar el aporte','err'); }
}

export async function eliminarMeta(id){
  if(!requireOwner() || !window.confirm('¿Eliminar esta meta y sus aportes?')) return;
  try{
    const { error } = await supabase.from('financial_goals').delete().eq('id', id);
    if(error) throw error;
    await sync('Meta eliminada');
  }catch(error){ console.error(error); toast('No se pudo eliminar la meta','err'); }
}

export function renderRecurringCategory(){
  const kind = document.getElementById('recurr-kind').value;
  const select = document.getElementById('recurr-cat');
  if(kind==='income'){
    select.innerHTML = ['Trabajo','Extra','Freelance','Negocio','Otros'].map(value=>`<option>${value}</option>`).join('');
    return;
  }
  select.innerHTML = Object.keys(getCategories()).map(value=>`<option>${esc(value)}</option>`).join('');
}

export async function guardarRecurrente(){
  if(!requireOwner()) return;
  const kind = document.getElementById('recurr-kind').value;
  const amount = positiveAmount(document.getElementById('recurr-monto').value);
  const day = Number(document.getElementById('recurr-dia').value);
  const startDate = document.getElementById('recurr-inicio').value || fechaLocalISO();
  const endDate = document.getElementById('recurr-fin').value || null;
  if(!amount || !Number.isInteger(day) || day<1 || day>31 || !fechaISOValida(startDate) || (endDate && (!fechaISOValida(endDate) || endDate<startDate))){
    toast('Completa los datos de la recurrencia correctamente','err'); return;
  }
  try{
    const { error } = await supabase.from('recurring_transactions').insert({
      group_id:state.activeGroupId, created_by:state.session.user.id, kind,
      category:document.getElementById('recurr-cat').value,
      description:document.getElementById('recurr-desc').value.trim() || document.getElementById('recurr-cat').value,
      amount, method:document.getElementById('recurr-metodo').value,
      day_of_month:day, start_date:startDate, end_date:endDate,
      account_id:document.getElementById('recurr-cuenta').value || null
    });
    if(error) throw error;
    ['recurr-monto','recurr-desc','recurr-fin'].forEach(id=>document.getElementById(id).value='');
    await sync('Movimiento recurrente creado ✓');
  }catch(error){ console.error(error); toast('No se pudo crear la recurrencia','err'); }
}

export async function toggleRecurrente(id, active){
  if(!requireOwner()) return;
  try{
    const { error } = await supabase.from('recurring_transactions').update({active}).eq('id', id);
    if(error) throw error;
    await sync(active ? 'Recurrencia activada' : 'Recurrencia pausada');
  }catch(error){ console.error(error); toast('No se pudo actualizar la recurrencia','err'); }
}

export async function eliminarRecurrente(id){
  if(!requireOwner() || !window.confirm('¿Eliminar este movimiento recurrente? Los movimientos ya creados se conservarán.')) return;
  try{
    const { error } = await supabase.from('recurring_transactions').delete().eq('id', id);
    if(error) throw error;
    await sync('Recurrencia eliminada');
  }catch(error){ console.error(error); toast('No se pudo eliminar la recurrencia','err'); }
}

export async function aplicarRecurrentesMes(){
  if(!requireOwner() || applyingRecurring) return;
  applyingRecurring = true;
  const yearMonth = fechaLocalISO().slice(0,7);
  try{
    const pending = recurringForMonth(state.DATA.recurrentes, yearMonth).filter(item=>{
      const rows = item.kind==='income' ? state.DATA.ingresos : state.DATA.gastos;
      return !rows.some(row=>row.recurringId===item.id && row.fecha===recurringDateForMonth(item, yearMonth));
    });
    let created = 0;
    for(const item of pending){
      const fecha = recurringDateForMonth(item, yearMonth);
      const payload = {
        group_id:state.activeGroupId, created_by:state.session.user.id, fecha,
        categoria:item.category, descripcion:item.description, monto:item.monto,
        observaciones:'Generado desde movimiento recurrente', account_id:item.accountId, recurring_id:item.id
      };
      const table = item.kind==='income' ? 'incomes' : 'expenses';
      if(item.kind==='expense') Object.assign(payload, {subcategoria:item.subcategory, metodo:item.method || 'Efectivo'});
      const { error } = await supabase.from(table).insert(payload);
      if(error && error.code !== '23505') throw error;
      if(!error) created++;
    }
    await sync(created ? `${created} movimiento(s) recurrente(s) registrado(s) ✓` : 'No hay movimientos recurrentes pendientes este mes');
  }catch(error){ console.error(error); toast('No se pudieron aplicar las recurrencias','err'); }
  finally { applyingRecurring = false; }
}

function renderProjection(){
  const canvas = document.getElementById('chart-proyeccion');
  if(!canvas || !window.Chart) return;
  const initial = activeBalance();
  const forecast = projectCashFlow(state.DATA, getSaldoDeuda, initial, new Date(new Date().getFullYear(), new Date().getMonth()+1, 1), 6);
  state.charts.proyeccion?.destroy();
  state.charts.proyeccion = new Chart(canvas.getContext('2d'), {
    type:'line', data:{
      labels:forecast.map(item=>item.yearMonth),
      datasets:[
        {label:'Saldo proyectado', data:forecast.map(item=>item.balance), borderColor:'#5C7A52', backgroundColor:'rgba(92,122,82,.12)', fill:true, tension:.35},
        {label:'Flujo mensual', data:forecast.map(item=>item.saldo), borderColor:'#49758C', backgroundColor:'rgba(73,117,140,.08)', fill:false, tension:.35}
      ]
    }, options:{plugins:{legend:{position:'bottom'}},scales:{y:{ticks:{callback:value=>'$'+value}},x:{grid:{display:false}}}}
  });
  const last = forecast.at(-1);
  document.getElementById('proyeccion-resumen').textContent = last ? `Saldo estimado a 6 meses: ${fmt(last.balance)}` : '';
}

function renderAccountsChart(balances){
  const wrap = document.getElementById('chart-cuentas-wrap');
  if(!wrap || !window.Chart) return;
  state.charts.cuentas?.destroy();
  if(!balances.length){ wrap.innerHTML = '<div class="empty">Crea una cuenta para ver su distribución</div>'; return; }
  if(!document.getElementById('chart-cuentas')) wrap.innerHTML = '<canvas id="chart-cuentas"></canvas>';
  const canvas = document.getElementById('chart-cuentas');
  state.charts.cuentas = new Chart(canvas.getContext('2d'), {
    type:'doughnut', data:{labels:balances.map(item=>item.name), datasets:[{data:balances.map(item=>Math.max(0,item.calculated)), backgroundColor:['#5C7A52','#49758C','#B58736','#C1603F','#8B6BA8']}]} ,
    options:{plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${fmt(ctx.parsed)}`}}},cutout:'60%'}
  });
}

function renderAccounts(){
  const balances = accountBalances(state.DATA);
  const list = document.getElementById('lista-cuentas');
  list.innerHTML = balances.length ? balances.map(account=>{
    const difference = account.difference;
    return `<div class="budget-row">
      <div class="budget-info"><div class="budget-cat">${esc(account.name)} <span class="badge badge-blue">${esc(account.type)}</span></div>
      <div class="budget-amounts">Calculado: ${fmt(account.calculated)}${account.reconciled != null ? ` · Real: ${fmt(account.reconciled)} · Diferencia: <span style="color:${difference===0?'var(--olive)':'var(--terracota)'}">${fmt(difference)}</span>` : ' · Sin conciliar'}</div></div>
      ${state.currentRole==='owner'?`<div class="list-item-actions"><button class="btn btn-soft btn-sm" onclick="conciliarCuenta('${account.id}')">Conciliar</button><button class="btn btn-soft btn-sm" onclick="eliminarCuenta('${account.id}')">×</button></div>`:''}
    </div>`;
  }).join('') : '<div class="empty">Crea una cuenta para separar efectivo, banco, ahorro o tarjeta.</div>';
  renderAccountsChart(balances);
}

function renderGoals(){
  const goals = goalProgress(state.DATA.metas, state.DATA.aportesMetas);
  const list = document.getElementById('lista-metas');
  list.innerHTML = goals.length ? goals.map(goal=>{
    const months = monthsUntil(goal.targetDate);
    const monthly = months && goal.remaining ? goal.remaining/months : null;
    return `<div class="budget-row"><div class="budget-info"><div class="budget-cat">${esc(goal.title)}</div>
      <div class="budget-amounts">${fmt(goal.saved)} de ${fmt(goal.targetAmount)} · faltan ${fmt(goal.remaining)}${goal.targetDate?` · objetivo ${goal.targetDate}`:''}${monthly?` · sugerido ${fmt(monthly)}/mes`:''}</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${goal.percent}%;background:${goal.percent>=100?'var(--olive)':'var(--mostaza)'}"></div></div></div>
      ${state.currentRole==='owner'?`<div class="list-item-actions"><button class="btn btn-soft btn-sm" onclick="aportarMeta('${goal.id}')">Aportar</button><button class="btn btn-soft btn-sm" onclick="eliminarMeta('${goal.id}')">×</button></div>`:''}
    </div>`;
  }).join('') : '<div class="empty">Crea una meta para saber cuánto debes ahorrar cada mes.</div>';
}

function renderRecurrings(){
  const list = document.getElementById('lista-recurrentes');
  list.innerHTML = state.DATA.recurrentes.length ? state.DATA.recurrentes.map(item=>`<div class="list-item">
    <div class="list-item-left"><div class="list-item-name">${esc(item.description)}</div><div class="list-item-meta">Día ${item.dayOfMonth} · ${esc(item.category)} · ${item.kind==='income'?'+':'−'}${fmt(item.monto)} · ${item.active?'Activa':'Pausada'}</div></div>
    ${state.currentRole==='owner'?`<div class="list-item-actions"><button class="btn btn-soft btn-sm" onclick="toggleRecurrente('${item.id}',${!item.active})">${item.active?'Pausar':'Activar'}</button><button class="btn btn-soft btn-sm" onclick="eliminarRecurrente('${item.id}')">×</button></div>`:''}
  </div>`).join('') : '<div class="empty">Sin movimientos recurrentes. Agrega sueldo, arriendo, servicios o cuotas para proyectar mejor.</div>';
}

export function checkPlanningAlerts(){
  const zone = document.getElementById('alert-zone');
  if(!zone) return;
  const alerts = goalProgress(state.DATA.metas, state.DATA.aportesMetas).filter(goal=>goal.targetDate && goal.remaining>0 && (monthsUntil(goal.targetDate) || 0)<=1)
    .map(goal=>`<div class="alert-banner warn">◉ La meta <b>${esc(goal.title)}</b> vence pronto y faltan ${fmt(goal.remaining)}.</div>`);
  zone.insertAdjacentHTML('beforeend', alerts.join(''));
}

export function renderPlanificacion(){
  const accountSelect = document.getElementById('recurr-cuenta');
  if(accountSelect) accountSelect.innerHTML = accountOptions(accountSelect.value);
  ['cuentas-editor','metas-editor','recurrentes-editor'].forEach(id=>{
    const editor = document.getElementById(id);
    if(!editor) return;
    editor.querySelectorAll('input,select,button').forEach(element=>{ element.disabled = state.currentRole !== 'owner'; });
  });
  renderRecurringCategory();
  renderAccounts();
  renderGoals();
  renderRecurrings();
  renderProjection();
}

registerModule({ id:'planificacion', ownerOnly:false, render:renderPlanificacion });
