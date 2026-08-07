/* ====================================================================
   registry.js — registro de módulos/pestañas.
   Patrón para agregar un módulo nuevo en el futuro:
     1. Crea js/modules/tu-modulo.js
     2. Al final de ese archivo llama a registerModule({...}) (ver
        cualquier módulo existente, p.ej. modules/gastos.js, como
        ejemplo de la forma exacta).
     3. Agrega en index.html un botón `.tab` con data-tab="tu-modulo"
        y un `.section` con id="sec-tu-modulo".
     4. Importa el archivo una vez desde js/app.js (basta con
        `import './modules/tu-modulo.js';`) para que se autoregistre.
   No hay que tocar ui.js, auth.js ni ningún otro módulo existente.
   ==================================================================== */

const modules = new Map();

/**
 * @param {Object} mod
 * @param {string} mod.id          - debe matchear data-tab="..." y sec-{id}
 * @param {boolean} [mod.ownerOnly] - oculta la pestaña a los viewers
 * @param {Function} [mod.render]  - se llama cuando la pestaña se muestra o
 *                                    cuando se recargan los datos
 */
export function registerModule(mod){
  if(!mod || !mod.id) throw new Error('registerModule: falta "id"');
  modules.set(mod.id, mod);
}
export function getModule(id){ return modules.get(id); }
export function allModules(){ return Array.from(modules.values()); }
