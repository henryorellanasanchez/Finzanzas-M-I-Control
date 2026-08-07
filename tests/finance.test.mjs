import test from 'node:test';
import assert from 'node:assert/strict';
import { positiveAmount, monthlyTotals, financialSummary } from '../js/finance.js';

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
