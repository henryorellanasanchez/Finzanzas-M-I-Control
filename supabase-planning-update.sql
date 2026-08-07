-- ============================================================================
-- M&I Control - actualización de planificación financiera
-- Ejecuta este archivo UNA SOLA VEZ en Supabase SQL Editor, antes de publicar
-- la versión que incorpora cuentas, metas y movimientos recurrentes.
-- ============================================================================
begin;

create table if not exists public.financial_accounts (
  id                  uuid primary key default gen_random_uuid(),
  group_id            uuid not null references public.finance_groups(id) on delete cascade,
  created_by          uuid not null references public.profiles(id),
  name                text not null,
  type                text not null default 'Banco' check (type in ('Efectivo','Banco','Tarjeta','Ahorro','Otro')),
  opening_balance     numeric(12,2) not null default 0,
  reconciled_balance  numeric(12,2),
  reconciled_at       date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (group_id, name)
);
create index if not exists financial_accounts_group_idx on public.financial_accounts (group_id, name);

create table if not exists public.financial_goals (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.finance_groups(id) on delete cascade,
  created_by      uuid not null references public.profiles(id),
  title           text not null,
  target_amount   numeric(12,2) not null check (target_amount > 0),
  target_date     date,
  initial_amount  numeric(12,2) not null default 0 check (initial_amount >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists financial_goals_group_idx on public.financial_goals (group_id, target_date);

create table if not exists public.goal_contributions (
  id          uuid primary key default gen_random_uuid(),
  goal_id     uuid not null references public.financial_goals(id) on delete cascade,
  group_id    uuid not null references public.finance_groups(id) on delete cascade,
  created_by  uuid not null references public.profiles(id),
  amount      numeric(12,2) not null check (amount > 0),
  fecha       date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists goal_contributions_goal_idx on public.goal_contributions (goal_id, fecha desc);

create table if not exists public.recurring_transactions (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.finance_groups(id) on delete cascade,
  created_by    uuid not null references public.profiles(id),
  kind          text not null check (kind in ('income','expense')),
  category      text not null,
  subcategory   text,
  description   text,
  amount        numeric(12,2) not null check (amount > 0),
  method        text,
  day_of_month  smallint not null check (day_of_month between 1 and 31),
  start_date    date not null default current_date,
  end_date      date,
  active        boolean not null default true,
  account_id    uuid references public.financial_accounts(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists recurring_transactions_group_idx on public.recurring_transactions (group_id, active, start_date);

alter table public.expenses add column if not exists account_id uuid references public.financial_accounts(id) on delete set null;
alter table public.expenses add column if not exists recurring_id uuid references public.recurring_transactions(id) on delete set null;
alter table public.incomes add column if not exists account_id uuid references public.financial_accounts(id) on delete set null;
alter table public.incomes add column if not exists recurring_id uuid references public.recurring_transactions(id) on delete set null;
alter table public.debt_payments add column if not exists account_id uuid references public.financial_accounts(id) on delete set null;
create index if not exists expenses_account_idx on public.expenses (group_id, account_id, fecha desc);
create index if not exists incomes_account_idx on public.incomes (group_id, account_id, fecha desc);
create index if not exists debt_payments_account_idx on public.debt_payments (group_id, account_id, fecha desc);
create unique index if not exists expenses_recurring_once_idx on public.expenses (recurring_id, fecha) where recurring_id is not null;
create unique index if not exists incomes_recurring_once_idx on public.incomes (recurring_id, fecha) where recurring_id is not null;

drop trigger if exists trg_financial_accounts_updated on public.financial_accounts;
create trigger trg_financial_accounts_updated before update on public.financial_accounts
  for each row execute function public.set_updated_at();
drop trigger if exists trg_financial_goals_updated on public.financial_goals;
create trigger trg_financial_goals_updated before update on public.financial_goals
  for each row execute function public.set_updated_at();
drop trigger if exists trg_recurring_transactions_updated on public.recurring_transactions;
create trigger trg_recurring_transactions_updated before update on public.recurring_transactions
  for each row execute function public.set_updated_at();

-- Evita referencias cruzadas entre grupos, incluso si un usuario posee ambos.
create or replace function public.validate_planning_references()
returns trigger language plpgsql set search_path = public as $$
declare reference_group uuid;
begin
  if new.account_id is not null then
    select group_id into reference_group from public.financial_accounts where id = new.account_id;
    if reference_group is null or reference_group <> new.group_id then
      raise exception 'La cuenta debe pertenecer al mismo grupo financiero.';
    end if;
  end if;
  if tg_table_name in ('expenses','incomes') and new.recurring_id is not null then
    select group_id into reference_group from public.recurring_transactions where id = new.recurring_id;
    if reference_group is null or reference_group <> new.group_id then
      raise exception 'La recurrencia debe pertenecer al mismo grupo financiero.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.validate_goal_contribution_group()
returns trigger language plpgsql set search_path = public as $$
declare goal_group uuid;
begin
  select group_id into goal_group from public.financial_goals where id = new.goal_id;
  if goal_group is null or goal_group <> new.group_id then
    raise exception 'La meta debe pertenecer al mismo grupo financiero.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_expenses_planning_refs on public.expenses;
create trigger trg_expenses_planning_refs before insert or update on public.expenses
  for each row execute function public.validate_planning_references();
drop trigger if exists trg_incomes_planning_refs on public.incomes;
create trigger trg_incomes_planning_refs before insert or update on public.incomes
  for each row execute function public.validate_planning_references();
drop trigger if exists trg_debt_payments_planning_refs on public.debt_payments;
create trigger trg_debt_payments_planning_refs before insert or update on public.debt_payments
  for each row execute function public.validate_planning_references();
drop trigger if exists trg_recurring_planning_refs on public.recurring_transactions;
create trigger trg_recurring_planning_refs before insert or update on public.recurring_transactions
  for each row execute function public.validate_planning_references();
drop trigger if exists trg_goal_contribution_group on public.goal_contributions;
create trigger trg_goal_contribution_group before insert or update on public.goal_contributions
  for each row execute function public.validate_goal_contribution_group();

alter table public.financial_accounts enable row level security;
alter table public.financial_goals enable row level security;
alter table public.goal_contributions enable row level security;
alter table public.recurring_transactions enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array['financial_accounts','financial_goals','goal_contributions','recurring_transactions'] loop
    execute format('drop policy if exists "members select %1$s" on public.%1$s', table_name);
    execute format('create policy "members select %1$s" on public.%1$s for select using (public.is_group_owner(group_id) or public.is_shared_viewer(group_id))', table_name);
    execute format('drop policy if exists "owner inserts %1$s" on public.%1$s', table_name);
    execute format('create policy "owner inserts %1$s" on public.%1$s for insert with check (public.is_group_owner(group_id) and created_by = auth.uid())', table_name);
    execute format('drop policy if exists "owner updates %1$s" on public.%1$s', table_name);
    execute format('create policy "owner updates %1$s" on public.%1$s for update using (public.is_group_owner(group_id))', table_name);
    execute format('drop policy if exists "owner deletes %1$s" on public.%1$s', table_name);
    execute format('create policy "owner deletes %1$s" on public.%1$s for delete using (public.is_group_owner(group_id))', table_name);
  end loop;
end $$;

commit;
