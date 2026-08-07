/* ====================================================================
   state.js — único lugar con el estado mutable de la app en memoria.
   Cualquier módulo nuevo que necesite leer o modificar datos globales
   (sesión, grupo activo, datos cargados) importa este objeto en vez
   de declarar sus propias variables globales.
   ==================================================================== */

export const state = {
  DATA: { gastos: [], ingresos: [], deudas: [], pagos: [], presupuestos: [], cuentas: [], metas: [], aportesMetas: [], recurrentes: [] },
  categories: {},
  customCategories: [],
  session: null,
  myProfile: null,
  myGroups: [],        // [{id, name, role}]
  activeGroupId: null,
  currentRole: null,   // 'owner' | 'viewer'
  tipoActivo: 'gasto',
  charts: { donut: null, trend: null, mensualBar: null },
  appBootstrapped: false,
  dataRequestId: 0,
  categoriesRequestId: 0,
  db: { status: 'unknown', lastSuccessAt: 0, error: null, retrying: false },
  googleCalendarConnected: false, // sesión de Google Calendar (separada del login), ver googleCalendar.js
};
