/* ====================================================================
   dataLayer.js — la única función que LEE todas las tablas y llena
   state.DATA. Los módulos de cada feature (gastos, ingresos, etc.)
   escriben directo a Supabase y luego llaman a loadAllData() para
   refrescar todo desde la fuente de verdad.
   ==================================================================== */
import { supabase } from './config.js';
import { state } from './state.js';
import { refresh, poblarFiltrosDeAnio } from './ui.js';

export async function loadAllData(){
  const gid = state.activeGroupId;
  const [exp, inc, deb, pay, bud] = await Promise.all([
    supabase.from('expenses').select('*').eq('group_id', gid),
    supabase.from('incomes').select('*').eq('group_id', gid),
    supabase.from('debts').select('*').eq('group_id', gid),
    supabase.from('debt_payments').select('*').eq('group_id', gid),
    supabase.from('budgets').select('*').eq('group_id', gid),
  ]);
  const { data: recordNotes, error: notesError } = await supabase
    .from('record_notes').select('record_type, record_id, visibility, content').eq('group_id', gid);
  [exp,inc,deb,pay,bud].forEach(r=>{ if(r.error) console.error(r.error); });
  if(notesError) console.error(notesError);

  const notes = {};
  (recordNotes||[]).forEach(n=>{
    notes[`${n.record_type}:${n.record_id}:${n.visibility}`] = n.content;
  });
  const note = (type, id, visibility) => notes[`${type}:${id}:${visibility}`] || '';

  state.DATA.gastos = (exp.data||[]).map(r=>({
    id:r.id, mes:r.fecha.slice(5,7), fecha:r.fecha, cat:r.categoria, sub:r.subcategoria||'',
    desc:r.descripcion||'', monto:Number(r.monto), metodo:r.metodo||'', obs:r.observaciones||'',
    privateNote:note('expense',r.id,'private'), publicNote:note('expense',r.id,'public')
  }));
  state.DATA.ingresos = (inc.data||[]).map(r=>({
    id:r.id, mes:r.fecha.slice(5,7), fecha:r.fecha, cat:r.categoria,
    desc:r.descripcion||'', monto:Number(r.monto), obs:r.observaciones||'',
    privateNote:note('income',r.id,'private'), publicNote:note('income',r.id,'public')
  }));
  state.DATA.deudas = (deb.data||[]).map(r=>({
    id:r.id, tipo:r.tipo, persona:r.persona, concepto:r.concepto||'',
    monto:Number(r.monto), cuota:Number(r.cuota||0), inicio:r.fecha_inicio, obs:r.observaciones||'',
    privateNote:note('debt',r.id,'private'), publicNote:note('debt',r.id,'public')
  }));
  state.DATA.pagos = (pay.data||[]).map(r=>({
    id:r.id, deudaId:r.debt_id, monto:Number(r.monto), fecha:r.fecha, metodo:r.metodo||'', obs:r.observaciones||'',
    privateNote:note('payment',r.id,'private'), publicNote:note('payment',r.id,'public')
  }));
  state.DATA.presupuestos = (bud.data||[]).map(r=>({ id:r.id, cat:r.categoria, limite:Number(r.limite) }));

  poblarFiltrosDeAnio();
  refresh();
}
