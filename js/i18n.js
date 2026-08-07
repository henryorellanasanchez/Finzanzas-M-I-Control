/* Traducciones de la interfaz. El contenido financiero se conserva intacto. */
import { state } from './state.js';
const LANG_KEY = 'finanzas_language';
let currentLanguage = 'es';

const messages = {
  es: {
    language: 'Idioma',
    spanish: 'Español',
    english: 'English',
    theme: 'Tema',
    themeSystem: 'Sistema',
    themeLight: 'Claro',
    themeDark: 'Oscuro',
    summary: 'Resumen', add: 'Agregar', expenses: 'Gastos', income: 'Ingresos', debts: 'Deudas',
    budgets: 'Presupuestos', monthly: 'Mensual', notes: 'Notas', reminders: 'Recordatorios',
    balanceEyebrow: 'Nuestro dinero, en equilibrio', planTogether: 'Planifiquen juntos.', moveTogether: 'Avancen juntos.',
    welcomeText: 'Un espacio claro para cuidar cada ingreso, gasto y meta de Michael & Ivana.',
    expensesByCategory: 'Gastos por categoría', incomeVsExpenses: 'Ingresos vs gastos', historical: 'Histórico',
    activeDebts: 'Deudas activas', recentMovements: 'Movimientos recientes', seeAll: 'Ver todos →',
    whatRegister: '¿Qué quieren registrar?', movements: 'M&I · MOVIMIENTOS', expense: 'Gasto', incomeType: 'Ingreso',
    newDebt: 'Nueva deuda', payDebt: 'Pagar deuda', clothing: 'Vestimenta', allYears: 'Todos los años',
    allMonths: 'Todos los meses', allCategories: 'Todas las categorías', exportCsv: 'Exportar CSV',
    totalFiltered: 'Total filtrado:', allExpenses: 'Todos los gastos', allIncome: 'Todos los ingresos',
    activeDebtsTitle: 'Deudas activas', paymentHistory: 'Historial de pagos', monthlyBudgets: 'Presupuestos mensuales',
    monthlySummary: 'Resumen mensual', privateNotes: 'Notas privadas', newNote: 'Nueva nota', newReminder: 'Nuevo recordatorio',
    systemReadOnly: 'Estás viendo este grupo en modo solo lectura — no puedes agregar, editar ni eliminar registros.',
    account: 'Mi cuenta', share: 'Compartir / invitar', toggleTheme: 'Cambiar tema', exportData: 'Exportar e importar datos',
    close: 'Cerrar', downloadExpenses: 'Descargar gastos (CSV)', downloadIncome: 'Descargar ingresos (CSV)',
    downloadPayments: 'Descargar pagos de deuda (CSV)', importCsv: 'Cargar datos desde CSV', importHelp: 'Selecciona un archivo CSV exportado por esta app para agregar sus registros.',
    chooseFile: 'Elegir archivo CSV', importData: 'Importar CSV', csvFormat: 'Formatos compatibles: gastos, ingresos y pagos de deuda.',
    imported: 'CSV importado correctamente', invalidCsv: 'No se pudo leer el CSV', noFile: 'Selecciona un archivo CSV primero.'
  },
  en: {
    language: 'Language', spanish: 'Spanish', english: 'English', theme: 'Theme', themeSystem: 'System', themeLight: 'Light', themeDark: 'Dark',
    summary: 'Overview', add: 'Add', expenses: 'Expenses', income: 'Income', debts: 'Debts', budgets: 'Budgets', monthly: 'Monthly', notes: 'Notes', reminders: 'Reminders',
    balanceEyebrow: 'Our money, in balance', planTogether: 'Plan together.', moveTogether: 'Move forward together.',
    welcomeText: 'A clear space to care for every income, expense, and goal for Michael & Ivana.',
    expensesByCategory: 'Expenses by category', incomeVsExpenses: 'Income vs expenses', historical: 'History', activeDebts: 'Active debts', recentMovements: 'Recent movements', seeAll: 'See all →',
    whatRegister: 'What would you like to record?', movements: 'M&I · MOVEMENTS', expense: 'Expense', incomeType: 'Income', newDebt: 'New debt', payDebt: 'Pay debt', clothing: 'Clothing',
    allYears: 'All years', allMonths: 'All months', allCategories: 'All categories', exportCsv: 'Export CSV', totalFiltered: 'Filtered total:', allExpenses: 'All expenses', allIncome: 'All income',
    activeDebtsTitle: 'Active debts', paymentHistory: 'Payment history', monthlyBudgets: 'Monthly budgets', monthlySummary: 'Monthly summary', privateNotes: 'Private notes', newNote: 'New note', newReminder: 'New reminder',
    systemReadOnly: 'You are viewing this group in read-only mode — you cannot add, edit, or delete records.', account: 'My account', share: 'Share / invite', toggleTheme: 'Change theme', exportData: 'Export and import data',
    close: 'Close', downloadExpenses: 'Download expenses (CSV)', downloadIncome: 'Download income (CSV)', downloadPayments: 'Download debt payments (CSV)',
    importCsv: 'Load data from CSV', importHelp: 'Select a CSV exported by this app to add its records.', chooseFile: 'Choose CSV file', importData: 'Import CSV', csvFormat: 'Supported formats: expenses, income, and debt payments.', imported: 'CSV imported successfully', invalidCsv: 'Could not read the CSV', noFile: 'Select a CSV file first.'
  }
};

export function t(key){ return messages[currentLanguage]?.[key] || messages.es[key] || key; }
export function currentLang(){ return currentLanguage; }

export function applyLanguage(language){
  currentLanguage = language === 'en' ? 'en' : 'es';
  document.documentElement.lang = currentLanguage;
  document.documentElement.dataset.lang = currentLanguage;
  document.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{ el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{ el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll('#filtro-mes-gas option[value=""],#filtro-mes-ing option[value=""]').forEach(el=>{ el.textContent = t('allMonths'); });
  document.querySelectorAll('#filtro-cat-gas option[value=""]').forEach(el=>{ el.textContent = t('allCategories'); });
  const selector = document.getElementById('language-switcher');
  if(selector) selector.value = currentLanguage;
  document.title = currentLanguage === 'en' ? 'Michael & Ivana · Control' : 'Michael & Ivana · Control';
  setTimeout(async ()=>{
    if(state.appBootstrapped){
      const { refresh, poblarFiltrosDeAnio } = await import('./ui.js');
      poblarFiltrosDeAnio();
      refresh();
    }
  }, 30);
}

export function changeLanguage(language){
  try{ localStorage.setItem(LANG_KEY, language === 'en' ? 'en' : 'es'); }catch(e){}
  applyLanguage(language);
}

export function initLanguage(){
  let saved = 'es';
  try{ saved = localStorage.getItem(LANG_KEY) || 'es'; }catch(e){}
  applyLanguage(saved);
}
