-- =====================================================================
-- Finanzas Personales — Migración 0001: núcleo (Fase 1)
-- Perfiles, instituciones, cuentas, categorías, libro de movimientos,
-- auditoría, vistas de saldo y funciones de agregación.
--
-- Principios:
--  * El saldo de una cuenta NUNCA se almacena: se deriva de los
--    movimientos confirmados (libro mayor). Editar o anular un movimiento
--    mantiene automáticamente la consistencia.
--  * Importes en numeric(14,2) y siempre positivos; el signo lo da
--    `direction` (+1 entra dinero, -1 sale dinero).
--  * Toda tabla tiene RLS por usuario. Las FK se validan además por
--    trigger para impedir referenciar registros de otro usuario.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  currency char(3) not null default 'USD',
  timezone text not null default 'America/Guayaquil',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- Instituciones financieras (catálogo global + propias del usuario)
-- ---------------------------------------------------------------------
create table public.financial_institutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null = catálogo del sistema
  name text not null check (char_length(name) between 2 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index financial_institutions_system_name_uq
  on public.financial_institutions (lower(name)) where user_id is null;
create unique index financial_institutions_user_name_uq
  on public.financial_institutions (user_id, lower(name)) where user_id is not null;

create trigger financial_institutions_updated_at before update on public.financial_institutions
  for each row execute function public.set_updated_at();

alter table public.financial_institutions enable row level security;

create policy "institutions_select" on public.financial_institutions
  for select using (user_id is null or user_id = auth.uid());
create policy "institutions_insert_own" on public.financial_institutions
  for insert with check (user_id = auth.uid());
create policy "institutions_update_own" on public.financial_institutions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "institutions_delete_own" on public.financial_institutions
  for delete using (user_id = auth.uid());

insert into public.financial_institutions (name) values
  ('Banco Pichincha'),
  ('Banco Guayaquil'),
  ('Banco del Pacífico'),
  ('Produbanco'),
  ('Banco Bolivariano'),
  ('Banco Internacional'),
  ('Banco del Austro'),
  ('Banco de Machala'),
  ('Banco Solidario'),
  ('Banco General Rumiñahui'),
  ('BanEcuador'),
  ('Cooperativa JEP'),
  ('Cooperativa Jardín Azuayo'),
  ('Cooperativa Policía Nacional'),
  ('Mutualista Pichincha');

-- ---------------------------------------------------------------------
-- Cuentas (bancos, efectivo, billeteras)
-- ---------------------------------------------------------------------
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  institution_id uuid references public.financial_institutions (id) on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  account_type text not null check (account_type in ('checking', 'savings', 'cash', 'wallet')),
  currency char(3) not null default 'USD',
  color text not null default '#7c3aed' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default 'landmark' check (char_length(icon) <= 32),
  is_active boolean not null default true,
  is_default boolean not null default false,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_default_must_be_active check (not is_default or is_active)
);

create index accounts_user_idx on public.accounts (user_id);
create unique index accounts_one_default_per_user
  on public.accounts (user_id) where is_default;
create unique index accounts_user_name_uq
  on public.accounts (user_id, lower(name));

create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

alter table public.accounts enable row level security;

create policy "accounts_select_own" on public.accounts
  for select using (user_id = auth.uid());
create policy "accounts_insert_own" on public.accounts
  for insert with check (user_id = auth.uid());
create policy "accounts_update_own" on public.accounts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- No se permite DELETE: las cuentas se desactivan para conservar historial.

-- ---------------------------------------------------------------------
-- Categorías de movimientos
-- ---------------------------------------------------------------------
create table public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('income', 'expense')),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default 'tag' check (char_length(icon) <= 32),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index transaction_categories_uq
  on public.transaction_categories (user_id, kind, lower(name));

create trigger transaction_categories_updated_at before update on public.transaction_categories
  for each row execute function public.set_updated_at();

alter table public.transaction_categories enable row level security;

create policy "categories_select_own" on public.transaction_categories
  for select using (user_id = auth.uid());
create policy "categories_insert_own" on public.transaction_categories
  for insert with check (user_id = auth.uid());
create policy "categories_update_own" on public.transaction_categories
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Libro de movimientos
--
-- kind:
--   opening    saldo inicial de la cuenta (no es ingreso del período)
--   income     ingreso ordinario         direction = +1
--   expense    gasto/consumo             direction = -1
--   transfer   entre cuentas propias     direction = -1 en account_id,
--              entra en counter_account_id. NO es ingreso ni gasto.
--   adjustment ajuste de saldo con motivo obligatorio (±)
--
-- status:
--   pending    programado/no confirmado: NO afecta saldos
--   confirmed  afecta saldos y reportes
--   void       anulado (se conserva para trazabilidad)
-- ---------------------------------------------------------------------
create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('opening', 'income', 'expense', 'transfer', 'adjustment')),
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'void')),
  account_id uuid not null references public.accounts (id) on delete restrict,
  counter_account_id uuid references public.accounts (id) on delete restrict,
  category_id uuid references public.transaction_categories (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  direction smallint not null check (direction in (-1, 1)),
  occurred_on date not null,
  description text not null check (char_length(description) between 1 and 120),
  notes text check (char_length(notes) <= 500),
  payment_method text check (payment_method in ('cash', 'debit', 'transfer', 'card', 'other')),
  expense_type text check (expense_type in ('fixed', 'variable')),
  reason text check (char_length(reason) <= 300),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint tx_direction_by_kind check (
    (kind = 'income' and direction = 1)
    or (kind = 'expense' and direction = -1)
    or (kind = 'transfer' and direction = -1)
    or kind in ('opening', 'adjustment')
  ),
  constraint tx_transfer_counter check (
    (kind = 'transfer' and counter_account_id is not null and counter_account_id <> account_id)
    or (kind <> 'transfer' and counter_account_id is null)
  ),
  constraint tx_category_by_kind check (
    (kind in ('income', 'expense') and category_id is not null)
    or (kind not in ('income', 'expense') and category_id is null)
  ),
  constraint tx_adjustment_reason check (
    kind <> 'adjustment' or (reason is not null and char_length(btrim(reason)) >= 3)
  ),
  constraint tx_expense_fields check (
    kind = 'expense' or (payment_method is null and expense_type is null)
  ),
  constraint tx_opening_confirmed check (kind <> 'opening' or status = 'confirmed' or status = 'void')
);

create index financial_transactions_user_date_idx
  on public.financial_transactions (user_id, occurred_on desc, created_at desc);
create index financial_transactions_account_idx on public.financial_transactions (account_id);
create index financial_transactions_counter_idx on public.financial_transactions (counter_account_id)
  where counter_account_id is not null;
create index financial_transactions_category_idx on public.financial_transactions (category_id)
  where category_id is not null;
-- Un solo saldo inicial vigente por cuenta
create unique index financial_transactions_one_opening
  on public.financial_transactions (account_id) where kind = 'opening' and status <> 'void';

create trigger financial_transactions_updated_at before update on public.financial_transactions
  for each row execute function public.set_updated_at();

-- Integridad entre usuarios: RLS no impide referenciar por id una fila
-- ajena en una FK, así que se valida explícitamente.
create or replace function public.validate_transaction_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_acc record;
  v_counter record;
  v_cat record;
begin
  select user_id, currency into v_acc from public.accounts where id = new.account_id;
  if v_acc.user_id is distinct from new.user_id then
    raise exception 'La cuenta no pertenece al usuario' using errcode = '42501';
  end if;

  if new.counter_account_id is not null then
    select user_id, currency into v_counter from public.accounts where id = new.counter_account_id;
    if v_counter.user_id is distinct from new.user_id then
      raise exception 'La cuenta destino no pertenece al usuario' using errcode = '42501';
    end if;
    if v_counter.currency <> v_acc.currency then
      raise exception 'Las transferencias entre monedas distintas no están soportadas' using errcode = '22023';
    end if;
  end if;

  if new.category_id is not null then
    select user_id, kind into v_cat from public.transaction_categories where id = new.category_id;
    if v_cat.user_id is distinct from new.user_id then
      raise exception 'La categoría no pertenece al usuario' using errcode = '42501';
    end if;
    if v_cat.kind <> new.kind then
      raise exception 'La categoría no corresponde al tipo de movimiento' using errcode = '22023';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'No se puede cambiar el propietario' using errcode = '42501';
    end if;
    if new.kind <> old.kind then
      raise exception 'No se puede cambiar el tipo de un movimiento; anúlalo y crea otro' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger financial_transactions_validate
  before insert or update on public.financial_transactions
  for each row execute function public.validate_transaction_refs();

alter table public.financial_transactions enable row level security;

create policy "tx_select_own" on public.financial_transactions
  for select using (user_id = auth.uid());
create policy "tx_insert_own" on public.financial_transactions
  for insert with check (user_id = auth.uid());
create policy "tx_update_own" on public.financial_transactions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Sin DELETE: los movimientos se anulan (status = 'void').

-- ---------------------------------------------------------------------
-- Auditoría de tablas críticas
-- ---------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_user_idx on public.audit_log (user_id, created_at desc);
create index audit_log_record_idx on public.audit_log (table_name, record_id);

alter table public.audit_log enable row level security;

create policy "audit_select_own" on public.audit_log
  for select using (user_id = auth.uid());
-- Sin políticas de escritura: solo el trigger (security definer) inserta.

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (user_id, table_name, record_id, action, old_data)
    values (old.user_id, tg_table_name, old.id, tg_op, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (user_id, table_name, record_id, action, old_data, new_data)
    values (new.user_id, tg_table_name, new.id, tg_op, to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.audit_log (user_id, table_name, record_id, action, new_data)
    values (new.user_id, tg_table_name, new.id, tg_op, to_jsonb(new));
    return new;
  end if;
end;
$$;

create trigger accounts_audit after insert or update or delete on public.accounts
  for each row execute function public.audit_row();
create trigger financial_transactions_audit after insert or update or delete on public.financial_transactions
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------
-- Alta de usuario: perfil + categorías iniciales
-- ---------------------------------------------------------------------
create or replace function public.seed_default_categories(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.transaction_categories (user_id, name, kind, color, icon) values
    (p_user, 'Alimentación',      'expense', '#f97316', 'utensils'),
    (p_user, 'Transporte',        'expense', '#3b82f6', 'bus'),
    (p_user, 'Combustible',       'expense', '#ef4444', 'fuel'),
    (p_user, 'Vivienda',          'expense', '#8b5cf6', 'home'),
    (p_user, 'Servicios básicos', 'expense', '#0ea5e9', 'zap'),
    (p_user, 'Internet',          'expense', '#6366f1', 'wifi'),
    (p_user, 'Telefonía',         'expense', '#14b8a6', 'smartphone'),
    (p_user, 'Suscripciones',     'expense', '#a855f7', 'repeat'),
    (p_user, 'Entretenimiento',   'expense', '#ec4899', 'film'),
    (p_user, 'Salud',             'expense', '#22c55e', 'heart-pulse'),
    (p_user, 'Educación',         'expense', '#eab308', 'graduation-cap'),
    (p_user, 'Compras',           'expense', '#f43f5e', 'shopping-bag'),
    (p_user, 'Otros',             'expense', '#64748b', 'tag'),
    (p_user, 'Sueldo',               'income', '#16a34a', 'briefcase'),
    (p_user, 'Trabajo independiente','income', '#0d9488', 'laptop'),
    (p_user, 'Bonificaciones',       'income', '#65a30d', 'gift'),
    (p_user, 'Comisiones',           'income', '#0891b2', 'percent'),
    (p_user, 'Reembolsos',           'income', '#7c3aed', 'rotate-ccw'),
    (p_user, 'Otros ingresos',       'income', '#64748b', 'plus-circle')
  on conflict do nothing;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''));
  perform public.seed_default_categories(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.audit_row() from public, anon, authenticated;
revoke execute on function public.validate_transaction_refs() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Saldos derivados
-- ---------------------------------------------------------------------
create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.user_id,
  coalesce(sum(m.signed_amount), 0)::numeric(14, 2) as balance
from public.accounts a
left join (
  select account_id, (direction * amount) as signed_amount
  from public.financial_transactions
  where status = 'confirmed'
  union all
  select counter_account_id, amount
  from public.financial_transactions
  where status = 'confirmed' and kind = 'transfer'
) m on m.account_id = a.id
group by a.id, a.user_id;

-- Totales del período (solo movimientos de flujo: income/expense).
-- opening, transfer y adjustment NO cuentan como ingreso ni gasto.
create or replace function public.period_totals(p_from date, p_to date)
returns table (
  income text,
  expense text,
  pending_income text,
  pending_expense text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(amount) filter (where kind = 'income'  and status = 'confirmed'), 0)::numeric(14,2)::text,
    coalesce(sum(amount) filter (where kind = 'expense' and status = 'confirmed'), 0)::numeric(14,2)::text,
    coalesce(sum(amount) filter (where kind = 'income'  and status = 'pending'), 0)::numeric(14,2)::text,
    coalesce(sum(amount) filter (where kind = 'expense' and status = 'pending'), 0)::numeric(14,2)::text
  from public.financial_transactions
  where user_id = auth.uid()
    and occurred_on between p_from and p_to
    and kind in ('income', 'expense');
$$;

create or replace function public.expenses_by_category(p_from date, p_to date)
returns table (
  category_id uuid,
  name text,
  color text,
  total text
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.name, c.color, sum(t.amount)::numeric(14,2)::text
  from public.financial_transactions t
  join public.transaction_categories c on c.id = t.category_id
  where t.user_id = auth.uid()
    and t.kind = 'expense'
    and t.status = 'confirmed'
    and t.occurred_on between p_from and p_to
  group by c.id, c.name, c.color
  order by sum(t.amount) desc;
$$;

-- Serie mensual de ingresos vs gastos (últimos p_months meses hasta p_end).
create or replace function public.monthly_cashflow(p_end date, p_months int default 6)
returns table (
  month date,
  income text,
  expense text
)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select (date_trunc('month', p_end) - make_interval(months => g))::date as month
    from generate_series(0, greatest(least(p_months, 24), 1) - 1) g
  )
  select
    m.month,
    coalesce(sum(t.amount) filter (where t.kind = 'income'), 0)::numeric(14,2)::text,
    coalesce(sum(t.amount) filter (where t.kind = 'expense'), 0)::numeric(14,2)::text
  from months m
  left join public.financial_transactions t
    on t.user_id = auth.uid()
   and t.status = 'confirmed'
   and t.kind in ('income', 'expense')
   and t.occurred_on >= m.month
   and t.occurred_on < (m.month + interval '1 month')
  group by m.month
  order by m.month;
$$;

-- ---------------------------------------------------------------------
-- Alta atómica de cuenta + saldo inicial
-- ---------------------------------------------------------------------
create or replace function public.create_account(
  p_name text,
  p_account_type text,
  p_institution_id uuid,
  p_currency char(3),
  p_color text,
  p_icon text,
  p_is_default boolean,
  p_opening_balance numeric,
  p_opening_date date
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_is_default then
    update public.accounts set is_default = false where user_id = auth.uid() and is_default;
  end if;

  insert into public.accounts (name, account_type, institution_id, currency, color, icon, is_default)
  values (p_name, p_account_type, p_institution_id, coalesce(p_currency, 'USD'), p_color, p_icon, p_is_default)
  returning id into v_id;

  if p_opening_balance is not null and p_opening_balance <> 0 then
    insert into public.financial_transactions
      (kind, status, account_id, amount, direction, occurred_on, description)
    values
      ('opening', 'confirmed', v_id, abs(p_opening_balance), sign(p_opening_balance)::smallint,
       p_opening_date, 'Saldo inicial');
  end if;

  return v_id;
end;
$$;

-- Cambiar/establecer saldo inicial de una cuenta (trazado por auditoría).
create or replace function public.set_opening_balance(
  p_account_id uuid,
  p_amount numeric,
  p_date date
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.financial_transactions
     set status = 'void'
   where account_id = p_account_id and kind = 'opening' and status <> 'void';

  if p_amount is not null and p_amount <> 0 then
    insert into public.financial_transactions
      (kind, status, account_id, amount, direction, occurred_on, description)
    values
      ('opening', 'confirmed', p_account_id, abs(p_amount), sign(p_amount)::smallint, p_date, 'Saldo inicial');
  end if;
end;
$$;

create or replace function public.set_default_account(p_account_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.accounts set is_default = false where user_id = auth.uid() and is_default and id <> p_account_id;
  update public.accounts set is_default = true where id = p_account_id and user_id = auth.uid() and is_active;
end;
$$;

grant execute on function public.period_totals(date, date) to authenticated;
grant execute on function public.expenses_by_category(date, date) to authenticated;
grant execute on function public.monthly_cashflow(date, int) to authenticated;
grant execute on function public.create_account(text, text, uuid, char, text, text, boolean, numeric, date) to authenticated;
grant execute on function public.set_opening_balance(uuid, numeric, date) to authenticated;
grant execute on function public.set_default_account(uuid) to authenticated;
revoke execute on function public.period_totals(date, date) from anon;
revoke execute on function public.expenses_by_category(date, date) from anon;
revoke execute on function public.monthly_cashflow(date, int) from anon;
revoke execute on function public.create_account(text, text, uuid, char, text, text, boolean, numeric, date) from anon;
revoke execute on function public.set_opening_balance(uuid, numeric, date) from anon;
revoke execute on function public.set_default_account(uuid) from anon;
