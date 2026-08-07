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
  [exp,inc,deb,pay,bud].forEach(r=>{ if(r.error) console.error(r.error); });

  state.DATA.gastos = (exp.data||[]).map(r=>({
    id:r.id, mes:r.fecha.slice(5,7), fecha:r.fecha, cat:r.categoria, sub:r.subcategoria||'',
    desc:r.descripcion||'', monto:Number(r.monto), metodo:r.metodo||'', obs:r.observaciones||''
  }));
  state.DATA.ingresos = (inc.data||[]).map(r=>({
    id:r.id, mes:r.fecha.slice(5,7), fecha:r.fecha, cat:r.categoria,
    desc:r.descripcion||'', monto:Number(r.monto), obs:r.observaciones||''
  }));
  state.DATA.deudas = (deb.data||[]).map(r=>({
    id:r.id, tipo:r.tipo, persona:r.persona, concepto:r.concepto||'',
    monto:Number(r.monto), cuota:Number(r.cuota||0), inicio:r.fecha_inicio, obs:r.observaciones||''
  }));
  state.DATA.pagos = (pay.data||[]).map(r=>({
    id:r.id, deudaId:r.debt_id, monto:Number(r.monto), fecha:r.fecha, metodo:r.metodo||'', obs:r.observaciones||''
  }));
  state.DATA.presupuestos = (bud.data||[]).map(r=>({ id:r.id, cat:r.categoria, limite:Number(r.limite) }));

  poblarFiltrosDeAnio();
  refresh();
}
