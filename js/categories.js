import { supabase } from './config.js';
import { state } from './state.js';
import { CATS_GASTO } from './constants.js';
import { esc, openModal, closeModal, toast } from './utils.js';

function cloneDefaults(){
  return Object.fromEntries(Object.entries(CATS_GASTO).map(([name, subs])=>[name, [...subs]]));
}

export function getCategories(){
  return Object.keys(state.categories||{}).length ? state.categories : cloneDefaults();
}

export async function loadCategories(){
  const groupId = state.activeGroupId;
  const requestId = ++state.categoriesRequestId;
  state.categories = cloneDefaults();
  state.customCategories = [];
  const { data, error } = await supabase.from('finance_categories')
    .select('id,name,subcategories,color').eq('group_id', groupId).order('name');
  if(requestId !== state.categoriesRequestId || groupId !== state.activeGroupId) return;
  if(error){
    console.warn('No se pudieron cargar categorías personalizadas', error);
    refreshCategorySelectors();
    return;
  }
  state.customCategories = data || [];
  (data||[]).forEach(row=>{ state.categories[row.name] = Array.isArray(row.subcategories) ? row.subcategories : []; });
  refreshCategorySelectors();
}

export function refreshCategorySelectors(){
  const categories = getCategories();
  const names = Object.keys(categories);
  const gasto = document.getElementById('g-cat');
  if(gasto){
    const previous = gasto.value;
    gasto.innerHTML = names.map(name=>`<option>${esc(name)}</option>`).join('');
    gasto.value = names.includes(previous) ? previous : names[0] || '';
    gasto.dispatchEvent(new Event('change'));
  }
  const budget = document.getElementById('b-cat');
  if(budget){
    const previous = budget.value;
    budget.innerHTML = names.map(name=>`<option>${esc(name)}</option>`).join('');
    budget.value = names.includes(previous) ? previous : names[0] || '';
  }
}

export function openCategoryManager(){
  if(state.currentRole !== 'owner'){ toast('Solo el propietario puede administrar categorías','err'); return; }
  const custom = state.customCategories || [];
  openModal(`
    <div class="modal-title">Categorías y subcategorías</div>
    <div class="modal-text">Agrega categorías para organizar mejor las finanzas del hogar. Escribe las subcategorías separadas por comas.</div>
    <div class="form-row">
      <div><label>Categoría</label><input id="custom-cat-name" placeholder="Ej: Proyecto de hogar"></div>
      <div><label>Subcategorías</label><input id="custom-cat-subs" placeholder="Materiales, mano de obra, otros"></div>
    </div>
    <button class="btn btn-primary btn-block" onclick="saveCustomCategory()">Guardar categoría</button>
    <div class="card-title" style="margin-top:18px"><div class="card-title-text">Categorías disponibles</div></div>
    <div class="category-list">
      ${Object.entries(getCategories()).map(([name, subs])=>{
        const row=custom.find(x=>x.name===name);
        return `<div class="list-item"><div class="list-item-left"><div class="list-item-name">${esc(name)}</div><div class="list-item-meta">${esc(subs.join(' · '))}</div></div>${row?`<button class="btn btn-soft btn-sm" onclick="deleteCustomCategory('${row.id}')">Quitar</button>`:''}</div>`;
      }).join('')}
    </div>
    <div class="modal-actions"><button class="btn btn-soft" onclick="closeModal()">Cerrar</button></div>
  `);
}

export async function saveCustomCategory(){
  if(state.currentRole !== 'owner') return;
  const name = document.getElementById('custom-cat-name').value.trim();
  const subcategories = document.getElementById('custom-cat-subs').value.split(',').map(x=>x.trim()).filter(Boolean);
  if(!name){ toast('Escribe el nombre de la categoría','err'); return; }
  const { error } = await supabase.from('finance_categories').upsert({
    group_id:state.activeGroupId, name, subcategories, created_by:state.session.user.id
  }, { onConflict:'group_id,name' });
  if(error){ toast('No se pudo guardar la categoría','err'); console.error(error); return; }
  await loadCategories();
  openCategoryManager();
  toast('Categoría guardada ✓');
}

export async function deleteCustomCategory(id){
  if(state.currentRole !== 'owner') return;
  const { error } = await supabase.from('finance_categories').delete().eq('id', id);
  if(error){ toast('No se pudo quitar la categoría','err'); console.error(error); return; }
  await loadCategories();
  openCategoryManager();
  toast('Categoría quitada');
}
