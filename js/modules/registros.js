/* ====================================================================
   modules/registros.js — borrado con confirmación, compartido por
   Gastos e Ingresos (las únicas dos tablas con botón de eliminar en
   la lista). Si agregas borrado a otra tabla, reutiliza doDelete()
   agregando un nuevo "kind" aquí.
   ==================================================================== */
import { esc, openModal, closeModal, toast } from '../utils.js';
import { requireOwner } from '../auth.js';
import { supabase } from '../config.js';
import { state } from '../state.js';
import { loadAllData } from '../dataLayer.js';

const TABLE_BY_KIND = { gasto: 'expenses', ingreso: 'incomes' };

export function confirmDelete(kind, id){
  const record = kind==='gasto'
    ? state.DATA.gastos.find(g=>g.id===id)
    : state.DATA.ingresos.find(i=>i.id===id);
  const label = record ? record.desc : 'este registro';
  openModal(`
    <div class="modal-title">¿Eliminar este registro?</div>
    <div class="modal-text">"${esc(label)}" se eliminará permanentemente. Esta acción no se puede deshacer.</div>
    <div class="modal-actions">
      <button class="btn btn-soft" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-danger" onclick="doDelete('${kind}','${id}')">Eliminar</button>
    </div>
  `);
}

export async function doDelete(kind, id){
  if(!requireOwner()){ closeModal(); return; }
  const table = TABLE_BY_KIND[kind];
  const { error } = await supabase.from(table).delete().eq('id', id);
  closeModal();
  if(error){ toast('No se pudo eliminar','err'); console.error(error); return; }
  await loadAllData();
  toast('Eliminado correctamente');
}
