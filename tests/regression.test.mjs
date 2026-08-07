import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('todos los módulos JavaScript tienen sintaxis válida', async () => {
  const files = [];
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  visit(path.join(root, 'js'));
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /^(?:<<<<<<<|=======|>>>>>>>)\s*$/m, file);
  }
});

test('configuración de despliegue y Service Worker están sincronizados', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  assert.ok(vercel.rewrites.some(item => item.source === '/share/:token'));
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(sw, /finanzas-shell-v8/);
  assert.match(sw, /\.\/js\/finance\.js/);
  assert.match(sw, /\.\/js\/modules\/planificacion\.js/);
  assert.match(sw, /\.\/js\/googleCalendar\.js/);
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(index, /mi-control\.png\?v=5/);
  assert.match(index, /id="connection-banner"/);
  assert.match(index, /id="i-mes" onchange="aplicarMesSeleccionado\('i'\)"/);
  assert.match(index, /id="g-mes" onchange="aplicarMesSeleccionado\('g'\)"/);
  assert.match(index, /id="i-obs"/);
});

test('la migración de planificación protege metas, cuentas y recurrencias con RLS', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase-planning-update.sql'), 'utf8');
  for (const table of ['financial_accounts', 'financial_goals', 'goal_contributions', 'recurring_transactions']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /members select %1\$s/);
  assert.match(migration, /owner inserts %1\$s/);
  assert.match(migration, /expenses_recurring_once_idx/);
  assert.match(migration, /validate_planning_references/);
});

test('el verificador de planificación cubre estructura, RLS e idempotencia', () => {
  const verify = fs.readFileSync(path.join(root, 'supabase-planning-verify.sql'), 'utf8');
  for (const name of ['financial_accounts', 'financial_goals', 'goal_contributions', 'recurring_transactions']) {
    assert.match(verify, new RegExp(name));
  }
  assert.match(verify, /rls_enabled/);
  assert.match(verify, /expenses_recurring_once_idx/);
  assert.match(verify, /trg_goal_contribution_group/);
});

test('el servidor no expone rutas fuera del workspace', () => {
  const source = fs.readFileSync(path.join(root, 'preview-server.cjs'), 'utf8');
  assert.match(source, /file\.startsWith\(root \+ path\.sep\)/);
  assert.match(source, /decodeURIComponent/);
});

test('las tablas sensibles tienen RLS y las funciones privilegiadas no son públicas', () => {
  const schema = fs.readFileSync(path.join(root, 'schema.sql'), 'utf8');
  for (const table of ['expenses', 'incomes', 'debts', 'debt_payments', 'budgets', 'record_notes', 'notes', 'reminders']) {
    assert.match(schema, new RegExp(`alter table public\\.${table}\\s+enable row level security`));
  }
  for (const signature of [
    'is_group_member(uuid)', 'is_group_owner(uuid)', 'is_shared_viewer(uuid)',
    'is_shared_note_viewer(uuid)', 'create_share_link(uuid, boolean)', 'accept_invitation(uuid)',
  ]) {
    assert.match(schema, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, '\\$&')} from public`));
    assert.match(schema, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, '\\$&')} from anon`));
  }
});

test('las categorías personalizadas siempre se escapan al entrar en HTML', () => {
  const files = [
    path.join(root, 'js/app.js'),
    path.join(root, 'js/categories.js'),
    path.join(root, 'js/modules/agregar.js'),
    path.join(root, 'js/modules/presupuestos.js'),
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /<option>\$\{(?:c|name|s)\}<\/option>/, file);
  }
});

test('la representación de evento Calendar usa límite exclusivo en días completos', async () => {
  globalThis.window = { supabase: { createClient: () => ({}) } };
  const { eventBody } = await import(pathToFileURL(path.join(root, 'js/googleCalendar.js')));
  assert.deepEqual(eventBody({ titulo: 'Pago', fecha: '2026-08-07' }).end, { date: '2026-08-08' });
  assert.throws(() => eventBody({ titulo: 'Pago', fecha: '2026-02-30' }));
});
