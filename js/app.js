/* ====================================================================
   app.js — punto de entrada único (cargado como <script type="module">
   desde index.html).

   Qué hace, en orden:
   1. Importa cada módulo de pestaña — el solo hecho de importarlos
      los autoregistra en registry.js (cada uno llama a
      registerModule() al final de su archivo).
   2. Importa los módulos que no son pestañas (compartir, exportar,
      borrado, tema, auth).
   3. Expone en window las funciones que el HTML invoca con
      onclick="..." (los navegadores buscan esos nombres en el ámbito
      global; los módulos ES no son globales por defecto, así que este
      es el único lugar donde se hace ese puente).
   4. Arranca la UI estática (selects, fechas por defecto) y el flujo
      de autenticación.

   ──────────────────────────────────────────────────────────────────
   CÓMO AGREGAR UN MÓDULO NUEVO (ej. "Metas de ahorro"):
     a) Crea js/modules/metas.js siguiendo el patrón de cualquier
        módulo existente (importa lo que necesites, define tus
        funciones, termina con registerModule({id:'metas', render:...})).
     b) Agrega aquí abajo: import './modules/metas.js';
     c) Si metas.js tiene funciones invocadas por onclick="" en el
        HTML que generes, expórtalas y agrégalas al objeto que se
        vuelca a window más abajo.
     d) En index.html agrega un <div class="tab" data-tab="metas"
        onclick="showTab('metas')">Metas</div> y su
        <div class="section" id="sec-metas">...</div>.
   No hace falta tocar ui.js, registry.js ni ningún otro módulo.
   ==================================================================== */

import { closeModal, esc, fechaLocalISO } from './utils.js';
import { showTab } from './ui.js';
import { toggleTheme, applyTheme, initTheme, changeThemeMode } from './theme.js';
import { initLanguage, changeLanguage, t } from './i18n.js';
import { MESES } from './constants.js';
import { getCategories, openCategoryManager, saveCustomCategory, deleteCustomCategory, refreshCategorySelectors } from './categories.js';
import { initConnectionRecovery } from './dataLayer.js';
import {
  initAuth, loginWithGoogle, logout, saveProfileAndContinue,
  onGroupSwitch, openAccountModal, retryAuth
} from './auth.js';

// --- módulos de pestaña (se autoregistran al importarse) ---
import './modules/dashboard.js';
import './modules/agregar.js';
import './modules/gastos.js';
import './modules/ingresos.js';
import './modules/deudas.js';
import './modules/presupuestos.js';
import './modules/mensual.js';
import './modules/notas.js';
import './modules/recordatorios.js';

// --- módulos sin pestaña propia ---
import { confirmDelete, doDelete } from './modules/registros.js';
import { showExportModal, exportCSV, importCSVFromInput, importCSVFile } from './modules/exportar.js';
import { openShareModal, crearInvitacion, copiarEnlace, revocarInvitacion, quitarMiembro } from './modules/compartir.js';

// funciones de cada módulo de pestaña que el HTML invoca directamente
import { renderGastos } from './modules/gastos.js';
import { renderIngresos } from './modules/ingresos.js';
import { renderMensual } from './modules/mensual.js';
import { setTipo, updateSubcat, guardarGasto, guardarIngreso, guardarDeuda, guardarPago } from './modules/agregar.js';
import { guardarPresupuesto, eliminarPresupuesto } from './modules/presupuestos.js';
import { guardarNota, eliminarNota } from './modules/notas.js';
import {
  guardarRecordatorio, eliminarRecordatorio, toggleCompletado, toggleSyncCheckbox,
  conectarCalendar, desconectarCalendar,
} from './modules/recordatorios.js';

/* ---------- puente window.* para los onclick="" del HTML ---------- */
Object.assign(window, {
  // navegación
  showTab, toggleTheme, changeThemeMode, changeLanguage,
  openCategoryManager, saveCustomCategory, deleteCustomCategory,
  // auth
  loginWithGoogle, logout, saveProfileAndContinue, onGroupSwitch, openAccountModal, retryAuth,
  // modal genérico
  closeModal,
  // gastos / ingresos
  renderGastos, renderIngresos, confirmDelete, doDelete,
  // agregar
  setTipo, updateSubcat, guardarGasto, guardarIngreso, guardarDeuda, guardarPago,
  // presupuestos
  guardarPresupuesto, eliminarPresupuesto,
  // mensual
  renderMensual,
  // notas (privadas, no se comparten con el grupo)
  guardarNota, eliminarNota,
  // recordatorios (privados) + sincronización con Google Calendar
  guardarRecordatorio, eliminarRecordatorio, toggleCompletado, toggleSyncCheckbox,
  conectarCalendar, desconectarCalendar,
  // exportar
  showExportModal, exportCSV, importCSVFromInput, importCSVFile,
  // compartir / invitaciones / miembros
  openShareModal, crearInvitacion, copiarEnlace, revocarInvitacion, quitarMiembro,
});

/* ---------- cerrar modal al hacer clic fuera de la caja ---------- */
document.getElementById('modal-overlay').addEventListener('click', e=>{
  if(e.target.id==='modal-overlay') closeModal();
});

/* ---------- UI estática inicial (selects, fechas por defecto) ---------- */
function initStaticUI(){
  try{ initTheme(); }catch(e){}
  try{ initLanguage(); }catch(e){}

  const today = fechaLocalISO();
  document.getElementById('g-fecha').value = today;
  document.getElementById('i-fecha').value = today;
  document.getElementById('rec-fecha').value = today;

  const gasOpts = Object.keys(getCategories()).map(c=>`<option>${esc(c)}</option>`).join('');
  document.getElementById('filtro-cat-gas').innerHTML = `<option value="">${t('allCategories')}</option>`+gasOpts;

  const mesesKeys = ['01','02','03','04','05','06','07','08','09','10','11','12'];
  ['filtro-mes-gas','filtro-mes-ing'].forEach(id=>{
    const sel = document.getElementById(id);
    sel.innerHTML = `<option value="">${t('allMonths')}</option>`+MESES.map((m,i)=>`<option value="${mesesKeys[i]}">${m}</option>`).join('');
  });

  setTipo('gasto');
  document.getElementById('b-cat').innerHTML = Object.keys(getCategories()).map(c=>`<option>${esc(c)}</option>`).join('');
  refreshCategorySelectors();
}

/* ---------- arranque ---------- */
initStaticUI();
initConnectionRecovery();
initAuth();

/* ---------- Service Worker (instalabilidad en Android/Chrome + shell offline) ---------- */
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('./sw.js').catch(err=>console.error('No se pudo registrar el Service Worker', err));
  });
}
