import test from 'node:test';
import assert from 'node:assert/strict';
import { positiveAmount, monthlyTotals, financialSummary, accountBalances, goalProgress, projectCashFlow } from '../js/finance.js';

test('los montos de movimientos deben ser números finitos y positivos', () => {
  assert.equal(positiveAmount('125.50'), 125.5);
  assert.equal(positiveAmount('0'), null);
  assert.equal(positiveAmount('-5'), null);
  assert.equal(positiveAmount('Infinity'), null);
  assert.equal(positiveAmount('texto'), null);
});

test('el saldo mensual descuenta pagos de deuda y suma cobros pendientes', () => {
  const totals = monthlyTotals({
    ingresos: [{ fecha:'2026-08-01', monto:1000 }],
    gastos: [{ fecha:'2026-08-02', monto:250 }],
    pagos: [{ fecha:'2026-08-03', monto:300, deudaId:'debo' }, { fecha:'2026-08-04', monto:50, deudaId:'cobro' }],
    deudas: [{ id:'debo', tipo:'Debo' }, { id:'cobro', tipo:'Me deben' }],
  }, '2026-08');
  assert.deepEqual(totals, { ing:1000, gas:250, pagosDeuda:300, cobrosDeuda:50, saldo:500 });
});

test('el balance acumulado descuenta los pagos de deuda sin duplicar la deuda pendiente', () => {
  const summary = financialSummary({
    ingresos: [{ monto:1000 }], gastos: [{ monto:250 }], pagos: [{ monto:300, deudaId:'debo' }, { monto:50, deudaId:'cobro' }],
    deudas: [{ id:'debo', monto:500, tipo:'Debo' }, { id:'cobro', monto:200, tipo:'Me deben' }],
  }, debt => debt.monto - 100);
  assert.deepEqual(summary, { ing:1000, gas:250, pagDeuda:300, cobrosDeuda:50, totalDeudas:500, neto:500 });
});

test('la conciliación compara el saldo real con los movimientos asignados a cada cuenta', () => {
  const balances = accountBalances({
    cuentas:[{id:'banco', openingBalance:100, reconciledBalance:175}],
    ingresos:[{accountId:'banco', monto:200}], gastos:[{accountId:'banco', monto:50}],
    pagos:[{accountId:'banco', deudaId:'debo', monto:25}], deudas:[{id:'debo', tipo:'Debo'}]
  });
  assert.equal(balances[0].calculated, 225);
  assert.equal(balances[0].difference, -50);
});

test('la proyección usa recurrencias y cuotas sin alterar registros reales', () => {
  const forecast = projectCashFlow({
    recurrentes:[
      {kind:'income', monto:1000, dayOfMonth:1, startDate:'2026-01-01', active:true},
      {kind:'expense', monto:300, dayOfMonth:5, startDate:'2026-01-01', active:true}
    ],
    deudas:[{id:'debo', tipo:'Debo', cuota:100, monto:500}], pagos:[]
  }, debt=>debt.monto, 50, new Date(2026, 7, 1), 2);
  assert.equal(forecast[0].saldo, 600);
  assert.equal(forecast[0].balance, 650);
  assert.equal(forecast[1].balance, 1250);
});

test('el avance de una meta suma su monto inicial y sus aportes', () => {
  const [goal] = goalProgress([{id:'meta', targetAmount:1000, initialAmount:150}], [{goalId:'meta', monto:250}]);
  assert.deepEqual({saved:goal.saved, remaining:goal.remaining, percent:goal.percent}, {saved:400, remaining:600, percent:40});
});
