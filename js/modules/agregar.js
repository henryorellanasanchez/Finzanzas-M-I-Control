/* ====================================================================
   modules/agregar.js — pestaña "Agregar" (solo owner). Un solo
   selector de tipo que muestra 4 formularios distintos, igual que en
   la versión original.
   ==================================================================== */
import { supabase } from '../config.js';
import { state } from '../state.js';
import { esc, fmt, toast, getSaldoDeuda, fechaLocalISO, fechaISOValida } from '../utils.js';
import { CATS_GASTO, MESES, MESES_KEYS } from '../constants.js';
import { requireOwner } from '../auth.js';
import { loadAllData } from '../dataLayer.js';
import { registerModule } from '../registry.js';
import { getCategories } from '../categories.js';

export function setTipo(t){
  state.tipoActivo = t;
  ensureNoteFields();
  document.querySelectorAll('#tipo-selector .type-btn').forEach(b=>b.classList.toggle('active', b.dataset.tipo===t));
  ['form-gasto','form-ingreso','form-deuda','form-pago'].forEach(f=>document.getElementById(f).style.display='none');
  if(t==='gasto'||t==='vest'){ document.getElementById('form-gasto').style.display='block'; initGastoForm(t==='vest'); }
  if(t==='ingreso'){ document.getElementById('form-ingreso').style.display='block'; }
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
  populateMes('g-mes');
  document.getElementById('g-fecha').value = fechaLocalISO();
}

export function updateSubcat(cats){
  const c = cats || getCategories();
  const cat = document.getElementById('g-cat').value;
  const subs = c[cat] || ['Otros'];
  document.getElementById('g-subcat').innerHTML = subs.map(s=>`<option>${esc(s)}</option>`).join('');
}

export function populateMes(id){
  document.getElementById(id).innerHTML = MESES.map((m,i)=>`<option value="${MESES_KEYS[i]}">${m}</option>`).join('');
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
    const { error } = await supabase.from('record_notes').insert(rows);
    if(error){ console.error(error); toast('El registro se guardó, pero no sus notas','err'); }
  }
}

function clearNoteFields(...ids){ ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); }

export function populatePagoDeuda(){
  const sel = document.getElementById('p-deuda');
  sel.innerHTML = state.DATA.deudas.map(d=>{
    const saldo = getSaldoDeuda(d);
    return `<option value="${d.id}">${esc(d.persona)} — ${esc(d.concepto)} (saldo: ${fmt(saldo)})</option>`;
  }).join('');
  document.getElementById('p-fecha').value = fechaLocalISO();
}

export async function guardarGasto(){
  if(!requireOwner()) return;
  const monto = parseFloat(document.getElementById('g-monto').value)||0;
  if(!monto){ toast('Ingresa un monto válido','err'); return; }
  const fecha = document.getElementById('g-fecha').value;
  if(!fechaISOValida(fecha)){ toast('Ingresa una fecha valida','err'); return; }
  const payload = {
    group_id: state.activeGroupId, created_by: state.session.user.id,
    fecha,
    categoria: document.getElementById('g-cat').value,
    subcategoria: document.getElementById('g-subcat').value,
    descripcion: document.getElementById('g-desc').value || document.getElementById('g-subcat').value,
    monto, metodo: document.getElementById('g-metodo').value,
    observaciones: document.getElementById('g-obs').value
  };
  const { data: created, error } = await supabase.from('expenses').insert(payload).select('id').single();
  if(error){ toast('No se pudo guardar el gasto','err'); console.error(error); return; }
  document.getElementById('g-monto').value='';
  document.getElementById('g-desc').value='';
  document.getElementById('g-obs').value='';
  await saveRecordNotes('expense', created.id, 'g-note-private', 'g-note-public');
  clearNoteFields('g-note-private','g-note-public');
  await loadAllData();
  toast('Gasto guardado ✓');
}

export async function guardarIngreso(){
  if(!requireOwner()) return;
  const monto = parseFloat(document.getElementById('i-monto').value)||0;
  if(!monto){ toast('Ingresa un monto válido','err'); return; }
  const fecha = document.getElementById('i-fecha').value;
  if(!fechaISOValida(fecha)){ toast('Ingresa una fecha valida','err'); return; }
  const payload = {
    group_id: state.activeGroupId, created_by: state.session.user.id,
    fecha,
    categoria: document.getElementById('i-cat').value,
    descripcion: document.getElementById('i-desc').value || 'Ingreso',
    monto, observaciones: ''
  };
  const { data: created, error } = await supabase.from('incomes').insert(payload).select('id').single();
  if(error){ toast('No se pudo guardar el ingreso','err'); console.error(error); return; }
  document.getElementById('i-monto').value='';
  document.getElementById('i-desc').value='';
  await saveRecordNotes('income', created.id, 'i-note-private', 'i-note-public');
  clearNoteFields('i-note-private','i-note-public');
  await loadAllData();
  toast('Ingreso guardado ✓');
}

export async function guardarDeuda(){
  if(!requireOwner()) return;
  const persona = document.getElementById('d-persona').value.trim();
  const monto = parseFloat(document.getElementById('d-monto').value)||0;
  if(!persona||!monto){ toast('Completa persona y monto','err'); return; }
  const payload = {
    group_id: state.activeGroupId, created_by: state.session.user.id,
    tipo: document.getElementById('d-tipo').value, persona,
    concepto: document.getElementById('d-concepto').value || 'Deuda',
    monto, cuota: parseFloat(document.getElementById('d-cuota').value)||0,
    fecha_inicio: document.getElementById('d-inicio').value || fechaLocalISO(),
    observaciones: document.getElementById('d-obs').value
  };
  const { data: created, error } = await supabase.from('debts').insert(payload).select('id').single();
  if(error){ toast('No se pudo crear la deuda','err'); console.error(error); return; }
  ['d-persona','d-concepto','d-monto','d-cuota','d-obs'].forEach(id=>document.getElementById(id).value='');
  await saveRecordNotes('debt', created.id, 'd-note-private', 'd-note-public');
  clearNoteFields('d-note-private','d-note-public');
  await loadAllData();
  toast('Deuda creada ✓');
}

export async function guardarPago(){
  if(!requireOwner()) return;
  const deudaId = document.getElementById('p-deuda').value;
  const monto = parseFloat(document.getElementById('p-monto').value)||0;
  if(!monto){ toast('Ingresa un monto válido','err'); return; }
  const deuda = state.DATA.deudas.find(d=>d.id===deudaId);
  const saldoActual = deuda ? getSaldoDeuda(deuda) : 0;
  const fecha = document.getElementById('p-fecha').value;
  if(!deuda){ toast('Selecciona una deuda valida','err'); return; }
  if(!fechaISOValida(fecha)){ toast('Ingresa una fecha valida','err'); return; }
  const payload = {
    group_id: state.activeGroupId, created_by: state.session.user.id, debt_id: deudaId, monto,
    fecha,
    metodo: document.getElementById('p-metodo').value, observaciones:'Abono'
  };
  const { data: created, error } = await supabase.from('debt_payments').insert(payload).select('id').single();
  if(error){ toast('No se pudo registrar el pago','err'); console.error(error); return; }
  document.getElementById('p-monto').value='';
  await saveRecordNotes('payment', created.id, 'p-note-private', 'p-note-public');
  clearNoteFields('p-note-private','p-note-public');
  await loadAllData();
  if(deuda && monto>=saldoActual){ toast(`¡Deuda con ${deuda.persona} saldada! 🎉`); }
  else { toast('Pago registrado — saldo actualizado ✓'); }
}

registerModule({ id: 'agregar', ownerOnly: true, render: null });
