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
