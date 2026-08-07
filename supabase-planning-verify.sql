-- ============================================================================
-- Verificación de planificación financiera
-- Ejecuta este archivo en Supabase SQL Editor DESPUÉS de la migración.
-- Todo debe devolver true / el conteo esperado.
-- ============================================================================

-- 1) Tablas y Row Level Security: las cuatro filas deben tener true en ambas columnas.
select
  expected.table_name,
  to_regclass('public.' || expected.table_name) is not null as table_exists,
  coalesce(cls.relrowsecurity, false) as rls_enabled
from (values
  ('financial_accounts'),
  ('financial_goals'),
  ('goal_contributions'),
  ('recurring_transactions')
) as expected(table_name)
left join pg_class cls on cls.oid = to_regclass('public.' || expected.table_name)
order by expected.table_name;

-- 2) Columnas que conectan movimientos con cuentas y recurrencias: las cinco filas deben ser true.
select
  expected.table_name,
  expected.column_name,
  exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = expected.table_name
      and c.column_name = expected.column_name
  ) as column_exists
from (values
  ('expenses', 'account_id'), ('expenses', 'recurring_id'),
  ('incomes', 'account_id'), ('incomes', 'recurring_id'),
  ('debt_payments', 'account_id')
) as expected(table_name, column_name)
order by expected.table_name, expected.column_name;

-- 3) Seguridad: cada tabla debe tener exactamente 4 políticas (lectura + insert/update/delete del owner).
select
  expected.table_name,
  count(policy.policyname) as policy_count,
  count(policy.policyname) = 4 as policy_count_ok
from (values
  ('financial_accounts'),
  ('financial_goals'),
  ('goal_contributions'),
  ('recurring_transactions')
) as expected(table_name)
left join pg_policies policy on policy.schemaname = 'public' and policy.tablename = expected.table_name
group by expected.table_name
order by expected.table_name;

-- 4) Protección contra duplicar movimientos recurrentes: ambas filas deben ser true.
select
  expected.index_name,
  to_regclass('public.' || expected.index_name) is not null as index_exists
from (values ('expenses_recurring_once_idx'), ('incomes_recurring_once_idx')) as expected(index_name)
order by expected.index_name;

-- 5) Triggers de integridad: las cinco filas deben ser true.
select
  expected.trigger_name,
  exists (
    select 1 from pg_trigger trigger
    join pg_class table_ref on table_ref.oid = trigger.tgrelid
    join pg_namespace schema_ref on schema_ref.oid = table_ref.relnamespace
    where schema_ref.nspname = 'public' and trigger.tgname = expected.trigger_name and not trigger.tgisinternal
  ) as trigger_exists
from (values
  ('trg_expenses_planning_refs'), ('trg_incomes_planning_refs'),
  ('trg_debt_payments_planning_refs'), ('trg_recurring_planning_refs'),
  ('trg_goal_contribution_group')
) as expected(trigger_name)
order by expected.trigger_name;
