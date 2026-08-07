/* Fuente de verdad de los datos del grupo activo. */
import { supabase } from './config.js';
import { state } from './state.js';
import { refresh, poblarFiltrosDeAnio, setConnectionState } from './ui.js';

const RETRY_DELAYS = [0, 450, 1200];
let recoveryInitialized = false;

function wait(ms){ return new Promise(resolve => window.setTimeout(resolve, ms)); }

function responseError(response){
  return response?.error ? String(response.error.message || response.error.code || 'Error de base de datos') : '';
}

async function fetchSnapshot(groupId){
  return Promise.all([
    supabase.from('expenses').select('id,fecha,categoria,subcategoria,descripcion,monto,metodo,observaciones').eq('group_id', groupId),
    supabase.from('incomes').select('id,fecha,categoria,descripcion,monto,observaciones').eq('group_id', groupId),
    supabase.from('debts').select('id,tipo,persona,concepto,monto,cuota,fecha_inicio,observaciones').eq('group_id', groupId),
    supabase.from('debt_payments').select('id,debt_id,monto,fecha,metodo,observaciones').eq('group_id', groupId),
    supabase.from('budgets').select('id,categoria,limite').eq('group_id', groupId),
    supabase.from('record_notes').select('record_type, record_id, visibility, content').eq('group_id', groupId),
  ]);
}

function snapshotError(responses){
  return responses.slice(0, 5).map(responseError).find(Boolean) || '';
}

export function initConnectionRecovery(){
  if(recoveryInitialized || typeof window === 'undefined') return;
  recoveryInitialized = true;
  window.addEventListener('offline', ()=>{
    state.db.status = 'offline';
    setConnectionState('offline', 'Sin conexión. Se conservan los últimos datos cargados.');
  });
  window.addEventListener('online', async ()=>{
    if(!state.activeGroupId) return;
    setConnectionState('retrying', 'Conexión restaurada. Sincronizando…');
    await loadAllData();
  });
}

export async function loadAllData(){
  const groupId = state.activeGroupId;
  if(!groupId) return false;
  initConnectionRecovery();
  const requestId = ++state.dataRequestId;
  state.db.retrying = false;
  setConnectionState('syncing', 'Sincronizando datos…');

  let responses = null;
  let lastError = '';
  for(let attempt = 0; attempt < RETRY_DELAYS.length; attempt++){
    if(attempt) await wait(RETRY_DELAYS[attempt]);
    if(requestId !== state.dataRequestId || groupId !== state.activeGroupId) return false;
    try{
      responses = await fetchSnapshot(groupId);
      lastError = snapshotError(responses);
    }catch(error){
      responses = null;
      lastError = error?.name === 'AbortError' ? 'Tiempo de espera agotado' : (error?.message || 'No se pudo conectar con la base de datos');
    }
    if(!lastError) break;
    state.db.retrying = attempt < RETRY_DELAYS.length - 1;
    if(state.db.retrying) setConnectionState('retrying', `Reintentando sincronización (${attempt + 1}/${RETRY_DELAYS.length - 1})…`);
  }

  if(requestId !== state.dataRequestId || groupId !== state.activeGroupId) return false;
  if(lastError || !responses){
    state.db.status = navigator.onLine === false ? 'offline' : 'error';
    state.db.error = lastError || 'No se pudo cargar la información';
    state.db.retrying = false;
    setConnectionState(state.db.status, navigator.onLine === false
      ? 'Sin conexión. Se conservan los últimos datos cargados.'
      : 'No se pudo actualizar la información. Revisa tu conexión e inténtalo de nuevo.');
    console.error('Error sincronizando datos:', state.db.error);
    return false;
  }

  const [exp, inc, deb, pay, bud, notesResponse] = responses;
  const notesQueryError = responseError(notesResponse);
  const recordNotes = notesResponse.data || [];
  const notes = {};
  recordNotes.forEach(note=>{
    notes[`${note.record_type}:${note.record_id}:${note.visibility}`] = note.content;
  });
  const previousNotes = {};
  state.DATA.gastos.forEach(row=>{
    previousNotes[`expense:${row.id}:private`] = row.privateNote || '';
    previousNotes[`expense:${row.id}:public`] = row.publicNote || '';
  });
  state.DATA.ingresos.forEach(row=>{
    previousNotes[`income:${row.id}:private`] = row.privateNote || '';
    previousNotes[`income:${row.id}:public`] = row.publicNote || '';
  });
  state.DATA.deudas.forEach(row=>{
    previousNotes[`debt:${row.id}:private`] = row.privateNote || '';
    previousNotes[`debt:${row.id}:public`] = row.publicNote || '';
  });
  state.DATA.pagos.forEach(row=>{
    previousNotes[`payment:${row.id}:private`] = row.privateNote || '';
    previousNotes[`payment:${row.id}:public`] = row.publicNote || '';
  });
  const getNote = (type, id, visibility) => notesQueryError
    ? (previousNotes[`${type}:${id}:${visibility}`] || '')
    : (notes[`${type}:${id}:${visibility}`] || '');

  // Solo reemplazamos el estado despues de tener las seis lecturas completas.
  // Asi una falla temporal no borra lo que el usuario ya estaba viendo.
  state.DATA.gastos = (exp.data||[]).map(row=>({
    id:row.id, mes:row.fecha.slice(5,7), fecha:row.fecha, cat:row.categoria, sub:row.subcategoria||'',
    desc:row.descripcion||'', monto:Number(row.monto), metodo:row.metodo||'', obs:row.observaciones||'',
    privateNote:getNote('expense',row.id,'private'), publicNote:getNote('expense',row.id,'public')
  }));
  state.DATA.ingresos = (inc.data||[]).map(row=>({
    id:row.id, mes:row.fecha.slice(5,7), fecha:row.fecha, cat:row.categoria,
    desc:row.descripcion||'', monto:Number(row.monto), obs:row.observaciones||'',
    privateNote:getNote('income',row.id,'private'), publicNote:getNote('income',row.id,'public')
  }));
  state.DATA.deudas = (deb.data||[]).map(row=>({
    id:row.id, tipo:row.tipo, persona:row.persona, concepto:row.concepto||'',
    monto:Number(row.monto), cuota:Number(row.cuota||0), inicio:row.fecha_inicio, obs:row.observaciones||'',
    privateNote:getNote('debt',row.id,'private'), publicNote:getNote('debt',row.id,'public')
  }));
  state.DATA.pagos = (pay.data||[]).map(row=>({
    id:row.id, deudaId:row.debt_id, monto:Number(row.monto), fecha:row.fecha, metodo:row.metodo||'', obs:row.observaciones||'',
    privateNote:getNote('payment',row.id,'private'), publicNote:getNote('payment',row.id,'public')
  }));
  state.DATA.presupuestos = (bud.data||[]).map(row=>({ id:row.id, cat:row.categoria, limite:Number(row.limite) }));

  state.db.status = notesQueryError ? 'partial' : 'online';
  state.db.error = notesQueryError || null;
  state.db.lastSuccessAt = Date.now();
  state.db.retrying = false;
  setConnectionState(state.db.status, notesQueryError
    ? 'Datos financieros sincronizados; las notas se actualizarán al recuperar la conexión.'
    : 'Datos sincronizados');
  poblarFiltrosDeAnio();
  refresh();
  return true;
}
