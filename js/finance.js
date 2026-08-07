/* Cálculos financieros puros: no dependen del DOM ni del estado global.
   Mantenerlos aquí evita que cada pantalla interprete el saldo de forma distinta. */

export function positiveAmount(value){
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

export function sumAmounts(records = []){
  return records.reduce((total, record) => total + (Number(record?.monto) || 0), 0);
}

export function debtPaymentTotals(pagos = [], deudas = []){
  const debtById = new Map(deudas.map(debt => [debt.id, debt]));
  return pagos.reduce((totals, payment) => {
    const amount = Number(payment?.monto) || 0;
    if(debtById.get(payment?.deudaId)?.tipo === 'Me deben') totals.cobrosDeuda += amount;
    else totals.pagosDeuda += amount;
    return totals;
  }, { pagosDeuda:0, cobrosDeuda:0 });
}

export function monthlyTotals({ ingresos = [], gastos = [], pagos = [], deudas = [] }, yearMonth){
  const inMonth = record => String(record?.fecha || '').startsWith(yearMonth);
  const ing = sumAmounts(ingresos.filter(inMonth));
  const gas = sumAmounts(gastos.filter(inMonth));
  const { pagosDeuda, cobrosDeuda } = debtPaymentTotals(pagos.filter(inMonth), deudas);
  return { ing, gas, pagosDeuda, cobrosDeuda, saldo: ing - gas - pagosDeuda + cobrosDeuda };
}

export function financialSummary({ ingresos = [], gastos = [], pagos = [], deudas = [] }, debtBalance){
  const ing = sumAmounts(ingresos);
  const gas = sumAmounts(gastos);
  const { pagosDeuda: pagDeuda, cobrosDeuda } = debtPaymentTotals(pagos, deudas);
  const totalDeudas = deudas.reduce((total, debt) => total + Math.max(0, Number(debtBalance(debt)) || 0), 0);
  return { ing, gas, pagDeuda, cobrosDeuda, totalDeudas, neto: ing - gas - pagDeuda + cobrosDeuda };
}

export function monthKey(date = new Date()){
  const value = date instanceof Date ? date : new Date(`${date}T12:00:00`);
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}`;
}

export function monthKeysFrom(date = new Date(), count = 6){
  const first = date instanceof Date ? new Date(date.getFullYear(), date.getMonth(), 1) : new Date(`${date}T12:00:00`);
  return Array.from({length:count}, (_, index)=>{
    const value = new Date(first.getFullYear(), first.getMonth()+index, 1);
    return monthKey(value);
  });
}

export function recurringDateForMonth(recurring, yearMonth){
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(Math.max(1, Number(recurring?.dayOfMonth) || 1), lastDay);
  return `${yearMonth}-${String(day).padStart(2,'0')}`;
}

export function recurringForMonth(recurrings = [], yearMonth){
  return recurrings.filter(recurring=>{
    if(!recurring?.active) return false;
    const due = recurringDateForMonth(recurring, yearMonth);
    return (!recurring.startDate || due >= recurring.startDate) && (!recurring.endDate || due <= recurring.endDate);
  });
}

export function projectedMonthlyTotals(data, yearMonth, debtBalance){
  const recurring = recurringForMonth(data.recurrentes || [], yearMonth);
  const ing = sumAmounts(recurring.filter(item=>item.kind==='income'));
  const gas = sumAmounts(recurring.filter(item=>item.kind==='expense'));
  let pagosDeuda = 0;
  let cobrosDeuda = 0;
  (data.deudas || []).forEach(debt=>{
    const due = Number(debt.cuota) || 0;
    const saldo = Math.max(0, Number(debtBalance(debt)) || 0);
    if(!due || !saldo || (debt.inicio && debt.inicio.slice(0,7) > yearMonth)) return;
    const amount = Math.min(due, saldo);
    if(debt.tipo === 'Me deben') cobrosDeuda += amount;
    else pagosDeuda += amount;
  });
  return { ing, gas, pagosDeuda, cobrosDeuda, saldo:ing-gas-pagosDeuda+cobrosDeuda };
}

export function projectCashFlow(data, debtBalance, initialBalance = 0, fromDate = new Date(), months = 6){
  let balance = Number(initialBalance) || 0;
  return monthKeysFrom(fromDate, months).map(yearMonth=>{
    const totals = projectedMonthlyTotals(data, yearMonth, debtBalance);
    balance += totals.saldo;
    return { yearMonth, ...totals, balance };
  });
}

export function accountBalances({ cuentas = [], ingresos = [], gastos = [], pagos = [], deudas = [] }){
  const debtById = new Map(deudas.map(debt=>[debt.id, debt]));
  return cuentas.map(account=>{
    let calculated = Number(account.openingBalance) || 0;
    ingresos.filter(item=>item.accountId===account.id).forEach(item=>{ calculated += Number(item.monto) || 0; });
    gastos.filter(item=>item.accountId===account.id).forEach(item=>{ calculated -= Number(item.monto) || 0; });
    pagos.filter(item=>item.accountId===account.id).forEach(item=>{
      const amount = Number(item.monto) || 0;
      calculated += debtById.get(item.deudaId)?.tipo === 'Me deben' ? amount : -amount;
    });
    const reconciled = account.reconciledBalance == null ? null : Number(account.reconciledBalance);
    return { ...account, calculated, reconciled, difference: reconciled == null ? null : reconciled-calculated };
  });
}

export function goalProgress(goals = [], contributions = []){
  return goals.map(goal=>{
    const saved = (Number(goal.initialAmount) || 0) + sumAmounts(contributions.filter(item=>item.goalId===goal.id));
    const target = Number(goal.targetAmount) || 0;
    return { ...goal, saved, remaining:Math.max(0,target-saved), percent:target ? Math.min(100, Math.round(saved/target*100)) : 0 };
  });
}
