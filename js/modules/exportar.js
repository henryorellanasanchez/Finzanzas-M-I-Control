/* Exportacion e importacion CSV del grupo activo. */
import { state } from '../state.js';
import { openModal, closeModal, toast, fechaISOValida } from '../utils.js';
import { positiveAmount } from '../finance.js';
import { supabase } from '../config.js';
import { loadAllData } from '../dataLayer.js';
import { requireOwner } from '../auth.js';
import { t } from '../i18n.js';

function csvCell(value){ return `"${String(value ?? '').replace(/"/g,'""')}"`; }

export function showExportModal(){
  openModal(`
    <div class="modal-title">${t('exportData')}</div>
    <div class="modal-text">${t('downloadExpenses').replace('gastos','registros')} en formato CSV, listo para Excel o Google Sheets.</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn btn-soft btn-block" onclick="exportCSV('gastos');closeModal()">${t('downloadExpenses')}</button>
      <button class="btn btn-soft btn-block" onclick="exportCSV('ingresos');closeModal()">${t('downloadIncome')}</button>
      <button class="btn btn-soft btn-block" onclick="exportCSV('pagos');closeModal()">${t('downloadPayments')}</button>
    </div>
    <div class="csv-import-panel">
      <div class="modal-title">${t('importCsv')}</div>
      <div class="modal-text">${t('importHelp')}</div>
      <input type="file" id="csv-import-file" accept=".csv,text/csv">
      <button class="btn btn-primary btn-block" onclick="importCSVFromInput()">${t('importData')}</button>
      <div class="csv-format-help">${t('csvFormat')}</div>
    </div>
    <div class="modal-actions" style="margin-top:1rem"><button class="btn btn-soft" onclick="closeModal()">${t('close')}</button></div>
  `);
}

export function exportCSV(kind){
  let rows=[], filename='';
  if(kind==='gastos'){
    rows=[['Fecha','Categoría','Subcategoría','Descripción','Monto','Método','Observaciones']];
    state.DATA.gastos.forEach(g=>rows.push([g.fecha,g.cat,g.sub,g.desc,g.monto,g.metodo,g.obs||'']));
    filename='gastos.csv';
  } else if(kind==='ingresos'){
    rows=[['Fecha','Categoría','Descripción','Monto','Observaciones']];
    state.DATA.ingresos.forEach(i=>rows.push([i.fecha,i.cat,i.desc,i.monto,i.obs||'']));
    filename='ingresos.csv';
  } else if(kind==='pagos'){
    rows=[['Fecha','Deuda','Monto','Método','Observaciones']];
    state.DATA.pagos.forEach(p=>{
      const d=state.DATA.deudas.find(x=>x.id===p.deudaId);
      rows.push([p.fecha, d ? `${d.persona} - ${d.concepto}` : '?', p.monto, p.metodo, p.obs||'']);
    });
    filename='pagos_deuda.csv';
  }
  const csv = rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('CSV descargado');
}

function normalizeHeader(value){
  return String(value||'').replace(/^\ufeff/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

function parseCSV(text){
  const rows=[]; let row=[]; let cell=''; let quoted=false;
  const input=String(text||'').replace(/^\ufeff/,'');
  for(let i=0;i<input.length;i++){
    const ch=input[i], next=input[i+1];
    if(ch==='"' && quoted && next==='"'){ cell+='"'; i++; continue; }
    if(ch==='"'){ quoted=!quoted; continue; }
    if(ch===',' && !quoted){ row.push(cell.trim()); cell=''; continue; }
    if((ch==='\n'||ch==='\r') && !quoted){
      if(ch==='\r' && next==='\n') i++;
      row.push(cell.trim()); cell='';
      if(row.some(v=>v!=='')) rows.push(row);
      row=[]; continue;
    }
    cell+=ch;
  }
  if(cell!=='' || row.length){ row.push(cell.trim()); if(row.some(v=>v!=='')) rows.push(row); }
  if(rows.length<2) throw new Error('CSV vacío');
  const headers=rows[0].map(normalizeHeader);
  return rows.slice(1).map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));
}

function numberValue(value){
  const normalized=String(value||'').replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.');
  const n=Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function dateValue(value){
  const date=String(value||'').trim();
  return fechaISOValida(date) ? date : '';
}

export async function importCSVFromInput(){
  const input=document.getElementById('csv-import-file');
  if(!input?.files?.[0]){ toast(t('noFile'),'err'); return; }
  await importCSVFile(input.files[0]);
}

export async function importCSVFile(file){
  if(!requireOwner()) return;
  try{
    const records=parseCSV(await file.text());
    const headers=Object.keys(records[0]||{});
    const isExpense=headers.includes('subcategoria') || headers.includes('metodo') && headers.includes('categoria');
    const isPayment=headers.includes('deuda');
    let inserted=0, skipped=0;
    if(isPayment){
      const payments=[];
      const remaining = new Map(state.DATA.deudas.map(d=>[
        d.id,
        Math.max(0, Number(d.monto) - state.DATA.pagos.filter(p=>p.deudaId===d.id).reduce((sum,p)=>sum+(Number(p.monto)||0),0))
      ]));
      for(const r of records){
        const date=dateValue(r.fecha), amount=positiveAmount(numberValue(r.monto));
        const debtText=String(r.deuda||'').trim();
        const debt=state.DATA.deudas.find(d=>`${d.persona} - ${d.concepto}`===debtText) || state.DATA.deudas.find(d=>debtText.includes(d.persona));
        const saldo = debt ? remaining.get(debt.id) || 0 : 0;
        if(!date || !amount || !debt || amount > saldo){ skipped++; continue; }
        payments.push({group_id:state.activeGroupId,created_by:state.session.user.id,debt_id:debt.id,fecha:date,monto:amount,metodo:r.metodo||'Efectivo',observaciones:r.observaciones||''});
        remaining.set(debt.id, saldo - amount);
      }
      if(payments.length){ const {error}=await supabase.from('debt_payments').insert(payments); if(error) throw error; inserted=payments.length; }
    } else if(isExpense){
      const expenses=[];
      for(const r of records){
        const date=dateValue(r.fecha), amount=positiveAmount(numberValue(r.monto));
        if(!date || !amount || !r.categoria){ skipped++; continue; }
        expenses.push({group_id:state.activeGroupId,created_by:state.session.user.id,fecha:date,categoria:r.categoria,subcategoria:r.subcategoria||'',descripcion:r.descripcion||r.subcategoria||r.categoria,monto:amount,metodo:r.metodo||'Efectivo',observaciones:r.observaciones||''});
      }
      if(expenses.length){ const {error}=await supabase.from('expenses').insert(expenses); if(error) throw error; inserted=expenses.length; }
    } else {
      const incomes=[];
      for(const r of records){
        const date=dateValue(r.fecha), amount=positiveAmount(numberValue(r.monto));
        if(!date || !amount || !r.categoria){ skipped++; continue; }
        incomes.push({group_id:state.activeGroupId,created_by:state.session.user.id,fecha:date,categoria:r.categoria,descripcion:r.descripcion||r.categoria,monto:amount,observaciones:r.observaciones||''});
      }
      if(incomes.length){ const {error}=await supabase.from('incomes').insert(incomes); if(error) throw error; inserted=incomes.length; }
    }
    await loadAllData();
    closeModal();
    toast(`${t('imported')}: ${inserted}${skipped ? ` · ${skipped} omitidos` : ''}`);
  }catch(error){ console.error(error); toast(t('invalidCsv'),'err'); }
}
