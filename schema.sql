-- ============================================================================
-- App de Finanzas — esquema de base de datos para Supabase (PostgreSQL)
-- ============================================================================
-- Cómo usar este archivo:
--   1. Entra a tu proyecto: https://supabase.com/dashboard/project/zflayxdhxmquuchrbrff
--   2. Ve a "SQL Editor" → "New query"
--   3. Pega TODO este archivo y ejecútalo una sola vez (de arriba a abajo).
--   4. Ve a "Authentication" → "Providers" y activa Google (ver README.md).
-- ============================================================================

create extension if not exists pgcrypto; -- para gen_random_uuid()

-- ----------------------------------------------------------------------------
-- 1. PERFILES (extiende auth.users; nombres/apellidos se piden en el 1er login)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombres     text not null,
  apellidos   text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. GRUPOS DE FINANZAS
-- ----------------------------------------------------------------------------
create table if not exists public.finance_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Mis finanzas',
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. MIEMBROS DEL GRUPO Y ROLES (owner | viewer)
-- ----------------------------------------------------------------------------
create table if not exists public.group_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.finance_groups(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('owner', 'viewer')),
  joined_at   timestamptz not null default now(),
  unique (group_id, user_id)
);

-- ----------------------------------------------------------------------------
-- 4. INVITACIONES (el id de cada fila ES el token usado en app.com/share/{token})
-- ----------------------------------------------------------------------------
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.finance_groups(id) on delete cascade,
  role        text not null default 'viewer' check (role in ('owner', 'viewer')),
  created_by  uuid not null references public.profiles(id),
  expires_at  timestamptz,
  revoked     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. GASTOS (expenses)
-- ----------------------------------------------------------------------------
create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.finance_groups(id) on delete cascade,
  created_by      uuid not null references public.profiles(id),
  fecha           date not null,
  categoria       text not null,
  subcategoria    text,
  descripcion     text,
  monto           numeric(12,2) not null check (monto >= 0),
  metodo          text,
  observaciones   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists expenses_group_fecha_idx on public.expenses (group_id, fecha desc);

-- ----------------------------------------------------------------------------
-- 6. INGRESOS (incomes)
-- ----------------------------------------------------------------------------
create table if not exists public.incomes (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.finance_groups(id) on delete cascade,
  created_by      uuid not null references public.profiles(id),
  fecha           date not null,
  categoria       text not null,
  descripcion     text,
  monto           numeric(12,2) not null check (monto >= 0),
  observaciones   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists incomes_group_fecha_idx on public.incomes (group_id, fecha desc);

-- ----------------------------------------------------------------------------
-- 7. DEUDAS (debts) — funcionalidad extra ya presente en la app original
-- ----------------------------------------------------------------------------
create table if not exists public.debts (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.finance_groups(id) on delete cascade,
  created_by      uuid not null references public.profiles(id),
  tipo            text not null default 'Debo',
  persona         text not null,
  concepto        text,
  monto           numeric(12,2) not null check (monto >= 0),
  cuota           numeric(12,2) default 0,
  fecha_inicio    date,
  observaciones   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists debts_group_idx on public.debts (group_id);

-- ----------------------------------------------------------------------------
-- 8. PAGOS DE DEUDA (debt_payments)
-- ----------------------------------------------------------------------------
create table if not exists public.debt_payments (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.finance_groups(id) on delete cascade,
  created_by      uuid not null references public.profiles(id),
  debt_id         uuid not null references public.debts(id) on delete cascade,
  monto           numeric(12,2) not null check (monto >= 0),
  fecha           date not null,
  metodo          text,
  observaciones   text,
  created_at      timestamptz not null default now()
);
create index if not exists debt_payments_group_idx on public.debt_payments (group_id);
create index if not exists debt_payments_debt_idx on public.debt_payments (debt_id);

-- ----------------------------------------------------------------------------
-- 9. PRESUPUESTOS (budgets)
-- ----------------------------------------------------------------------------
create table if not exists public.budgets (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.finance_groups(id) on delete cascade,
  created_by      uuid not null references public.profiles(id),
  categoria       text not null,
  limite          numeric(12,2) not null check (limite >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (group_id, categoria)
);

-- ============================================================================
-- TRIGGER: actualizar updated_at automáticamente
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_expenses_updated on public.expenses;
create trigger trg_expenses_updated before update on public.expenses
  for each row execute function public.set_updated_at();

drop trigger if exists trg_incomes_updated on public.incomes;
create trigger trg_incomes_updated before update on public.incomes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_debts_updated on public.debts;
create trigger trg_debts_updated before update on public.debts
  for each row execute function public.set_updated_at();

drop trigger if exists trg_budgets_updated on public.budgets;
create trigger trg_budgets_updated before update on public.budgets
  for each row execute function public.set_updated_at();

-- ============================================================================
-- FUNCIONES AUXILIARES PARA RLS (evitan recursión infinita en group_members)
-- ============================================================================
-- IMPORTANTE: estas funciones son SECURITY DEFINER y las crea el rol "postgres"
-- (propietario de las tablas), que por defecto NO está sujeto a RLS. Por eso
-- pueden consultar group_members sin disparar de nuevo sus propias políticas.

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members gm
    where gm.group_id = p_group_id and gm.user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from group_members gm
    where gm.group_id = p_group_id and gm.user_id = auth.uid() and gm.role = 'owner'
  );
$$;

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;

-- ============================================================================
-- RPC: aceptar una invitación por token (usado por el flujo /share/{token})
-- ============================================================================
create or replace function public.accept_invitation(p_token uuid)
returns table(group_id uuid, role text, group_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitations;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión para aceptar la invitación.';
  end if;

  select * into v_inv from public.invitations where id = p_token and not revoked;
  if v_inv is null then
    raise exception 'Invitación no válida o revocada.';
  end if;

  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'Esta invitación ha expirado.';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_inv.group_id, auth.uid(), v_inv.role)
  on conflict (group_id, user_id) do nothing;

  return query
    select fg.id, gm.role, fg.name
    from public.finance_groups fg
    join public.group_members gm on gm.group_id = fg.id and gm.user_id = auth.uid()
    where fg.id = v_inv.group_id;
end;
$$;

grant execute on function public.accept_invitation(uuid) to authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles        enable row level security;
alter table public.finance_groups  enable row level security;
alter table public.group_members   enable row level security;
alter table public.invitations     enable row level security;
alter table public.expenses        enable row level security;
alter table public.incomes         enable row level security;
alter table public.debts           enable row level security;
alter table public.debt_payments   enable row level security;
alter table public.budgets         enable row level security;

-- ---------- profiles ----------
drop policy if exists "select own or co-member profile" on public.profiles;
create policy "select own or co-member profile" on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.group_members me
      join public.group_members them on them.group_id = me.group_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );

drop policy if exists "insert own profile" on public.profiles;
create policy "insert own profile" on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (id = auth.uid());

-- ---------- finance_groups ----------
drop policy if exists "members select their groups" on public.finance_groups;
create policy "members select their groups" on public.finance_groups
  for select using (owner_id = auth.uid() or public.is_group_member(id));

drop policy if exists "users create groups they own" on public.finance_groups;
create policy "users create groups they own" on public.finance_groups
  for insert with check (owner_id = auth.uid());

drop policy if exists "owner updates group" on public.finance_groups;
create policy "owner updates group" on public.finance_groups
  for update using (owner_id = auth.uid());

drop policy if exists "owner deletes group" on public.finance_groups;
create policy "owner deletes group" on public.finance_groups
  for delete using (owner_id = auth.uid());

-- ---------- group_members ----------
drop policy if exists "members select group roster" on public.group_members;
create policy "members select group roster" on public.group_members
  for select using (public.is_group_member(group_id));

-- Permite (a) el bootstrap: el owner registrado en finance_groups se inserta
-- a sí mismo como primer miembro 'owner'; (b) un owner ya confirmado agrega
-- más miembros directamente (la invitación por enlace usa accept_invitation,
-- que es SECURITY DEFINER y no pasa por esta política).
drop policy if exists "owner bootstraps or adds members" on public.group_members;
create policy "owner bootstraps or adds members" on public.group_members
  for insert with check (
    (
      role = 'owner' and user_id = auth.uid()
      and exists (select 1 from public.finance_groups fg where fg.id = group_id and fg.owner_id = auth.uid())
    )
    or public.is_group_owner(group_id)
  );

drop policy if exists "owner updates member roles" on public.group_members;
create policy "owner updates member roles" on public.group_members
  for update using (public.is_group_owner(group_id));

drop policy if exists "owner removes or self leaves" on public.group_members;
create policy "owner removes or self leaves" on public.group_members
  for delete using (public.is_group_owner(group_id) or user_id = auth.uid());

-- Ningún grupo puede quedar sin owner. Esto se hace con un TRIGGER (no solo
-- con RLS) porque la pregunta "¿esta fila es la última owner del grupo?"
-- necesita comparar contra el resto de la tabla con semántica OLD/NEW clara,
-- algo que una cláusula USING/WITH CHECK de RLS no garantiza de forma
-- confiable al evaluarse fila por fila. Aplica tanto si se intenta ELIMINAR
-- al último owner (por el propio owner saliendo, o por otro owner
-- quitándolo) como si se intenta CAMBIARLE el rol a 'viewer'.
create or replace function public.prevent_orphan_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_remaining_owners int;
begin
  if tg_op = 'DELETE' then
    if old.role <> 'owner' then
      return old;
    end if;
    v_group_id := old.group_id;
  elsif tg_op = 'UPDATE' then
    if new.role = 'owner' or old.role <> 'owner' then
      return new;
    end if;
    v_group_id := old.group_id;
  end if;

  select count(*) into v_remaining_owners
  from public.group_members
  where group_id = v_group_id and role = 'owner' and id <> old.id;

  if v_remaining_owners = 0 then
    raise exception 'No puedes dejar este grupo sin ningún owner. Asigna otro owner antes de continuar.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

drop trigger if exists trg_prevent_orphan_group on public.group_members;
create trigger trg_prevent_orphan_group
  before update or delete on public.group_members
  for each row execute function public.prevent_orphan_group();

-- ---------- invitations ----------
drop policy if exists "owner manages invitations" on public.invitations;
create policy "owner manages invitations" on public.invitations
  for select using (public.is_group_owner(group_id) or created_by = auth.uid());

drop policy if exists "owner creates invitations" on public.invitations;
create policy "owner creates invitations" on public.invitations
  for insert with check (public.is_group_owner(group_id) and created_by = auth.uid());

drop policy if exists "owner updates invitations" on public.invitations;
create policy "owner updates invitations" on public.invitations
  for update using (public.is_group_owner(group_id));

drop policy if exists "owner deletes invitations" on public.invitations;
create policy "owner deletes invitations" on public.invitations
  for delete using (public.is_group_owner(group_id));

-- ---------- expenses / incomes / debts / debt_payments / budgets ----------
-- Mismo patrón para las 5 tablas transaccionales: cualquier miembro puede
-- LEER; solo el rol 'owner' del grupo puede crear, editar o eliminar.
do $$
declare
  t text;
begin
  foreach t in array array['expenses','incomes','debts','debt_payments','budgets'] loop
    execute format('drop policy if exists "members select %1$s" on public.%1$s', t);
    execute format($f$
      create policy "members select %1$s" on public.%1$s
        for select using (public.is_group_member(group_id));
    $f$, t);

    execute format('drop policy if exists "owner inserts %1$s" on public.%1$s', t);
    execute format($f$
      create policy "owner inserts %1$s" on public.%1$s
        for insert with check (public.is_group_owner(group_id) and created_by = auth.uid());
    $f$, t);

    execute format('drop policy if exists "owner updates %1$s" on public.%1$s', t);
    execute format($f$
      create policy "owner updates %1$s" on public.%1$s
        for update using (public.is_group_owner(group_id));
    $f$, t);

    execute format('drop policy if exists "owner deletes %1$s" on public.%1$s', t);
    execute format($f$
      create policy "owner deletes %1$s" on public.%1$s
        for delete using (public.is_group_owner(group_id));
    $f$, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 10. NOTAS PERSONALES — NO se comparten ni con miembros del mismo grupo.
-- Por eso esta tabla usa user_id en vez de group_id, y sus políticas RLS no
-- referencian group_members en absoluto: solo el dueño de la fila puede
-- verla o tocarla, sea owner o viewer en cualquier grupo de finanzas.
-- ----------------------------------------------------------------------------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  titulo      text,
  contenido   text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists notes_user_idx on public.notes (user_id, created_at desc);

drop trigger if exists trg_notes_updated on public.notes;
create trigger trg_notes_updated before update on public.notes
  for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

drop policy if exists "self selects own notes" on public.notes;
create policy "self selects own notes" on public.notes
  for select using (user_id = auth.uid());

drop policy if exists "self inserts own notes" on public.notes;
create policy "self inserts own notes" on public.notes
  for insert with check (user_id = auth.uid());

drop policy if exists "self updates own notes" on public.notes;
create policy "self updates own notes" on public.notes
  for update using (user_id = auth.uid());

drop policy if exists "self deletes own notes" on public.notes;
create policy "self deletes own notes" on public.notes
  for delete using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 11. RECORDATORIOS — personales, igual que "notes": user_id, no group_id.
-- Cada recordatorio puede opcionalmente estar sincronizado con un evento de
-- Google Calendar (google_event_id), creado desde el frontend con el token
-- OAuth de Calendar del propio usuario (nunca pasa por Supabase ni por el
-- backend: la app llama directo a la API de Google desde el navegador).
-- ----------------------------------------------------------------------------
create table if not exists public.reminders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  titulo           text not null,
  descripcion      text,
  fecha            date not null,
  hora             time,             -- null = evento de todo el día
  prioridad        text not null default 'media' check (prioridad in ('alta','media','baja')),
  completado       boolean not null default false,
  google_event_id  text,             -- id del evento en Google Calendar, si se sincronizó
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists reminders_user_idx on public.reminders (user_id, fecha);

drop trigger if exists trg_reminders_updated on public.reminders;
create trigger trg_reminders_updated before update on public.reminders
  for each row execute function public.set_updated_at();

alter table public.reminders enable row level security;

drop policy if exists "self selects own reminders" on public.reminders;
create policy "self selects own reminders" on public.reminders
  for select using (user_id = auth.uid());

drop policy if exists "self inserts own reminders" on public.reminders;
create policy "self inserts own reminders" on public.reminders
  for insert with check (user_id = auth.uid());

drop policy if exists "self updates own reminders" on public.reminders;
create policy "self updates own reminders" on public.reminders
  for update using (user_id = auth.uid());

drop policy if exists "self deletes own reminders" on public.reminders;
create policy "self deletes own reminders" on public.reminders
  for delete using (user_id = auth.uid());

-- ============================================================================
-- Fin del esquema.
-- ============================================================================
