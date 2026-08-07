-- Verificacion posterior a ejecutar schema.sql.
-- Este archivo NO modifica datos ni estructura.

-- 1) Tablas requeridas y RLS activo.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'profiles','finance_groups','group_members','invitations','share_link_views',
    'expenses','incomes','debts','debt_payments','budgets','finance_categories',
    'record_notes','notes','reminders'
  )
order by c.relname;

-- 2) Las funciones sensibles no deben ser ejecutables por anon/public.
--    authenticated debe tener permiso en las RPC que usa la app.
select p.oid::regprocedure as function_name,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'is_group_member','is_group_owner','is_shared_viewer',
    'is_shared_note_viewer','create_share_link','accept_invitation'
  )
order by function_name;

-- Resultado esperado: rls_enabled = true; anon_can_execute = false;
-- y authenticated_can_execute = true para las funciones listadas.
