/* ====================================================================
   modules/agregar.js — pestaña "Agregar" (solo owner). Un solo
   selector de tipo que muestra 4 formularios distintos, igual que en
   la versión original.
   ==================================================================== */
import { supabase } from '../config.js';
import { state } from '../state.js';
import { esc, fmt, toast, getSaldoDeuda, fechaLocalISO, fechaISOValida } from '../utils.js';
import { positiveAmount } from '../finance.js';
import { CATS_GASTO, MESES, MESES_KEYS } from '../constants.js';
import { requireOwner } from '../auth.js';
import { loadAllData } from '../dataLayer.js';
import { registerModule } from '../registry.js';
import { getCategories } from '../categories.js';

const savingForms = new Set();

function beginSave(formId){
  if(savingForms.has(formId)){
    toast('Este registro ya se está guardando','err');
    return false;
  }
  savingForms.add(formId);
  const button = document.querySelector(`#${formId} button`);
  if(button) button.disabled = true;
  return true;
}

function endSave(formId){
  savingForms.delete(formId);
  const button = document.querySelector(`#${formId} button`);
  if(button) button.disabled = false;
}

async function refreshAfterWrite(successMessage){
  let synced = false;
  try { synced = await loadAllData(); }
  catch(error){ console.error('Error actualizando datos después de guardar:', error); }
  toast(synced ? successMessage : `${successMessage} La sincronización se reintentará al recuperar la conexión.`, synced ? undefined : 'err');
}

export function setTipo(t){
  state.tipoActivo = t;
  ensureNoteFields();
  document.querySelectorAll('#tipo-selector .type-btn').forEach(b=>b.classList.toggle('active', b.dataset.tipo===t));
  ['form-gasto','form-ingreso','form-deuda','form-pago'].forEach(f=>document.getElementById(f).style.display='none');
  if(t==='gasto'||t==='vest'){ document.getElementById('form-gasto').style.display='block'; initGastoForm(t==='vest'); }
  if(t==='ingreso'){
    document.getElementById('form-ingreso').style.display='block';
    const fecha = document.getElementById('i-fecha');
    if(!fecha.value) fecha.value = fechaLocalISO();
    populateMes('i-mes');
    sincronizarMesConFecha('i');
    populateAccountSelects();
  }
  if(t==='deuda'){ document.getElementById('form-deuda').style.display='block'; }
  if(t==='pago'){ document.getElementById('form-pago').style.display='block'; populatePagoDeuda(); }
}

function ensureNoteFields(){
  [['form-gasto','g'],['form-ingreso','i'],['form-deuda','d'],['form-pago','p']].forEach(([formId,prefix])=>{
    const form = document.getElementById(formId);
    if(!form || document.getElementById(`${prefix}-note-private`)) return;
    const row = document.createElement('div');
    row.className = 'form-row';
    row.innerHTML = `<div><label>Nota privada</label><input type="text" id="${prefix}-note-private" placeholder="Solo tú la verás"></div>
      <div><label>Nota pública</label><input type="text" id="${prefix}-note-public" placeholder="Se podrá compartir"></div>`;
    const button = form.querySelector('button');
    form.insertBefore(row, button || null);
  });
}

export function initGastoForm(isVest){
  const allCats = getCategories();
  const cats = isVest ? {'Vestimenta': allCats['Vestimenta'] || CATS_GASTO['Vestimenta']} : allCats;
  const catSel = document.getElementById('g-cat');
  catSel.innerHTML = Object.keys(cats).map(c=>`<option>${esc(c)}</option>`).join('');
  if(isVest) catSel.value = 'Vestimenta';
  updateSubcat(cats);
  populateAccountSelects();
  const fecha = document.getElementById('g-fecha');
  if(!fecha.value) fecha.value = fechaLocalISO();
  populateMes('g-mes');
  sincronizarMesConFecha('g');
}

export function updateSubcat(cats){
  const c = cats || getCategories();
  const cat = document.getElementById('g-cat').value;
  const subs = c[cat] || ['Otros'];
  document.getElementById('g-subcat').innerHTML = subs.map(s=>`<option>${esc(s)}</option>`).join('');
}

export function populateMes(id){
  const select = document.getElementById(id);
  if(!select) return;
  const previous = select.value;
  select.innerHTML = MESES.map((month, index)=>`<option value="${MESES_KEYS[index]}">${month}</option>`).join('');
  select.value = MESES_KEYS.includes(previous) ? previous : MESES_KEYS[new Date().getMonth()];
}

export function sincronizarMesConFecha(prefix){
  const fecha = document.getElementById(`${prefix}-fecha`)?.value;
  const select = document.getElementById(`${prefix}-mes`);
  if(select && fechaISOValida(fecha)) select.value = fecha.slice(5,7);
}

export function aplicarMesSeleccionado(prefix){
  const select = document.getElementById(`${prefix}-mes`);
  const input = document.getElementById(`${prefix}-fecha`);
  if(!select || !input || !MESES_KEYS.includes(select.value)) return;
  const current = fechaISOValida(input.value) ? input.value : fechaLocalISO();
  const year = Number(current.slice(0,4));
  const day = Number(current.slice(8,10));
  const month = Number(select.value);
  const lastDay = new Date(year, month, 0).getDate();
  input.value = `${year}-${select.value}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
}

export function populateAccountSelects(){
  const options = ['<option value="">Sin cuenta asignada</option>', ...state.DATA.cuentas.map(account=>`<option value="${account.id}">${esc(account.name)} · ${esc(account.type)}</option>`)].join('');
  ['g-cuenta','i-cuenta','p-cuenta'].forEach(id=>{
    const select = document.getElementById(id);
    if(!select) return;
    const previous = select.value;
    select.innerHTML = options;
    select.value = state.DATA.cuentas.some(account=>account.id===previous) ? previous : '';
  });
}

async function saveRecordNotes(recordType, recordId, privateId, publicId){
  const rows = [
    { visibility:'private', content:(document.getElementById(privateId)?.value || '').trim() },
    { visibility:'public', content:(document.getElementById(publicId)?.value || '').trim() },
  ].filter(n=>n.content).map(n=>({
    ...n, record_type:recordType, record_id:recordId,
    group_id:state.activeGroupId, owner_id:state.session.user.id
  }));
  if(rows.length){
    try{
      const { error } = await supabase.from('record_notes').insert(rows);
      if(error) throw error;
    } catch(error){ console.error(error); toast('El registro se guardó, pero no sus notas','err'); }
  }
}

function clearNoteFields(...ids){ ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); }

export function populatePagoDeuda(){
  const sel = document.getElementById('p-deuda');
  const pendientes = state.DATA.deudas.filter(d=>getSaldoDeuda(d) > 0);
  sel.innerHTML = pendientes.map(d=>{
    const saldo = getSaldoDeuda(d);
    return `<option value="${d.id}">${esc(d.persona)} — ${esc(d.concepto)} (saldo: ${fmt(saldo)})</option>`;
  }).join('');
  if(!pendientes.length) sel.innerHTML = '<option value="">No hay deudas pendientes</option>';
  populateAccountSelects();
  document.getElementById('p-fecha').value = fechaLocalISO();
}

export async function guardarGasto(){
  if(!requireOwner()) return;
  const monto = positiveAmount(document.getElementById('g-monto').value);
  if(!monto){ toast('Ingresa un monto válido','err'); return; }
  const fecha = document.getElementById('g-fecha').value;
  if(!fechaISOValida(fecha)){ toast('Ingresa una fecha valida','err'); return; }
  if(!beginSave('form-gasto')) return;
  try{
  const payload = {
    group_id: state.activeGroupId, created_by: state.session.user.id,
    fecha,
    categoria: document.getElementById('g-cat').value,
    subcategoria: document.getElementById('g-subcat').value,
    descripcion: document.getElementById('g-desc').value || document.getElementById('g-subcat').value,
    monto, metodo: document.getElementById('g-metodo').value,
    observaciones: document.getElementById('g-obs').value,
    account_id: document.getElementById('g-cuenta').value || null
  };
  const { data: created, error } = await supabase.from('expenses').insert(payload).select('id').single();
  if(error){ toast('No se pudo guardar el gasto','err'); console.error(error); return; }
  document.getElementById('g-monto').value='';
  document.getElementById('g-desc').value='';
  document.getElementById('g-obs').value='';
  await saveRecordNotes('expense', created.id, 'g-note-private', 'g-note-public');
  clearNoteFields('g-note-private','g-note-public');
  await refreshAfterWrite('Gasto guardado ✓');
  } catch(error) {
    console.error(error);
    toast('No se pudo guardar el gasto','err');
  } finally { endSave('form-gasto'); }
}

export async function guardarIngreso(){
  if(!requireOwner()) return;
  const monto = positiveAmount(document.getElementById('i-monto').value);
  if(!monto){ toast('Ingresa un monto válido','err'); return; }
  const fecha = document.getElementById('i-fecha').value;
  if(!fechaISOValida(fecha)){ toast('Ingresa una fecha valida','err'); return; }
  if(!beginSave('form-ingreso')) return;
  try{
  const payload = {
    group_id: state.activeGroupId, created_by: state.session.user.id,
    fecha,
    categoria: document.getElementById('i-cat').value,
    descripcion: document.getElementById('i-desc').value || 'Ingreso',
    monto, observaciones: document.getElementById('i-obs').value.trim(),
    account_id: document.getElementById('i-cuenta').value || null
  };
  const { data: created, error } = await supabase.from('incomes').insert(payload).select('id').single();
  if(error){ toast('No se pudo guardar el ingreso','err'); console.error(error); return; }
  document.getElementById('i-monto').value='';
  document.getElementById('i-desc').value='';
  document.getElementById('i-obs').value='';
  await saveRecordNotes('income', created.id, 'i-note-private', 'i-note-public');
  clearNoteFields('i-note-private','i-note-public');
  await refreshAfterWrite('Ingreso guardado ✓');
  } catch(error) {
    console.error(error);
    toast('No se pudo guardar el ingreso','err');
  } finally { endSave('form-ingreso'); }
}

export async function guardarDeuda(){
  if(!requireOwner()) return;
  const persona = document.getElementById('d-persona').value.trim();
  const monto = positiveAmount(document.getElementById('d-monto').value);
  const cuotaValue = document.getElementById('d-cuota').value;
  const cuota = cuotaValue === '' ? 0 : positiveAmount(cuotaValue);
  const fechaInicio = document.getElementById('d-inicio').value || fechaLocalISO();
  if(!persona||!monto){ toast('Completa persona y monto','err'); return; }
  if(cuotaValue !== '' && !cuota){ toast('La cuota debe ser un monto positivo','err'); return; }
  if(!fechaISOValida(fechaInicio)){ toast('Ingresa una fecha valida','err'); return; }
  if(!beginSave('form-deuda')) return;
  try{
  const payload = {
    group_id: state.activeGroupId, created_by: state.session.user.id,
    tipo: document.getElementById('d-tipo').value, persona,
    concepto: document.getElementById('d-concepto').value || 'Deuda',
    monto, cuota,
    fecha_inicio: fechaInicio,
    observaciones: document.getElementById('d-obs').value
  };
  const { data: created, error } = await supabase.from('debts').insert(payload).select('id').single();
  if(error){ toast('No se pudo crear la deuda','err'); console.error(error); return; }
  ['d-persona','d-concepto','d-monto','d-cuota','d-obs'].forEach(id=>document.getElementById(id).value='');
  await saveRecordNotes('debt', created.id, 'd-note-private', 'd-note-public');
  clearNoteFields('d-note-private','d-note-public');
  await refreshAfterWrite('Deuda creada ✓');
  } catch(error) {
    console.error(error);
    toast('No se pudo crear la deuda','err');
  } finally { endSave('form-deuda'); }
}

export async function guardarPago(){
  if(!requireOwner()) return;
  const deudaId = document.getElementById('p-deuda').value;
  const monto = positiveAmount(document.getElementById('p-monto').value);
  if(!monto){ toast('Ingresa un monto válido','err'); return; }
  const deuda = state.DATA.deudas.find(d=>d.id===deudaId);
  const saldoActual = deuda ? getSaldoDeuda(deuda) : 0;
  const fecha = document.getElementById('p-fecha').value;
  if(!deuda){ toast('Selecciona una deuda valida','err'); return; }
  if(!fechaISOValida(fecha)){ toast('Ingresa una fecha valida','err'); return; }
  if(monto > saldoActual){ toast(`El pago no puede superar el saldo pendiente (${fmt(saldoActual)})`,'err'); return; }
  if(!beginSave('form-pago')) return;
  try{
  const payload = {
    group_id: state.activeGroupId, created_by: state.session.user.id, debt_id: deudaId, monto,
    fecha,
    metodo: document.getElementById('p-metodo').value, observaciones:'Abono', account_id: document.getElementById('p-cuenta').value || null
  };
  const { data: created, error } = await supabase.from('debt_payments').insert(payload).select('id').single();
  if(error){ toast('No se pudo registrar el pago','err'); console.error(error); return; }
  document.getElementById('p-monto').value='';
  await saveRecordNotes('payment', created.id, 'p-note-private', 'p-note-public');
  clearNoteFields('p-note-private','p-note-public');
  const synced = await loadAllData();
  if(!synced){ toast('Pago registrado. La sincronización se reintentará al recuperar la conexión.','err'); return; }
  if(deuda && monto>=saldoActual){ toast(`¡Deuda con ${deuda.persona} saldada! 🎉`); }
  else { toast('Pago registrado — saldo actualizado ✓'); }
  } catch(error) {
    console.error(error);
    toast('No se pudo registrar el pago','err');
  } finally { endSave('form-pago'); }
}

registerModule({ id: 'agregar', ownerOnly: true, render: ()=>setTipo(state.tipoActivo || 'gasto') });
