-- =====================================================================
-- Finanzas Personales — Migración 0003: Fase 2
-- Tarjetas de crédito, compras diferidas, préstamos y reglas recurrentes.
--
-- Se extiende el libro de movimientos (financial_transactions):
--   card_opening       deuda inicial de una tarjeta (anterior a la app). No es gasto.
--   card_payment       pago de tarjeta desde una cuenta: baja la cuenta y la deuda. No es gasto.
--   loan_disbursement  préstamo recibido en una cuenta: sube la cuenta. No es ingreso.
--   loan_payment       abono a CAPITAL de un préstamo: baja la cuenta y la deuda. No es gasto.
--                      (los intereses/cargos se registran como `expense` en el mismo grupo)
--   expense con credit_card_id: consumo con tarjeta. Es gasto y sube la deuda; no toca bancos.
--
-- Deuda de tarjeta  = Σ(-direction·amount) de sus movimientos (excepto pagos) − Σ pagos.
-- Saldo de préstamo = saldo inicial − Σ abonos a capital confirmados.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tarjetas de crédito
-- ---------------------------------------------------------------------
create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  institution_id uuid references public.financial_institutions (id) on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  network text not null check (network in ('visa', 'mastercard', 'amex', 'diners', 'discover', 'other')),
  credit_limit numeric(14, 2) not null check (credit_limit >= 0),
  statement_day smallint not null check (statement_day between 1 and 31),
  due_day smallint not null check (due_day between 1 and 31),
  last4 char(4) check (last4 ~ '^[0-9]{4}$'),
  color text not null default '#4f46e5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index credit_cards_user_idx on public.credit_cards (user_id);
create unique index credit_cards_user_name_uq on public.credit_cards (user_id, lower(name));

create trigger credit_cards_updated_at before update on public.credit_cards
  for each row execute function public.set_updated_at();
create trigger credit_cards_audit after insert or update or delete on public.credit_cards
  for each row execute function public.audit_row();

alter table public.credit_cards enable row level security;
create policy "cards_select_own" on public.credit_cards for select using (user_id = auth.uid());
create policy "cards_insert_own" on public.credit_cards for insert with check (user_id = auth.uid());
create policy "cards_update_own" on public.credit_cards for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Compras con tarjeta (diferidas o previas a la app) y su cronograma
-- ---------------------------------------------------------------------
create table public.credit_card_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards (id) on delete restrict,
  category_id uuid references public.transaction_categories (id) on delete restrict,
  description text not null check (char_length(description) between 1 and 120),
  merchant text check (char_length(merchant) <= 80),
  purchase_date date not null,
  -- Capital pendiente que entra a la deuda (total de la compra, o lo que resta si es previa).
  principal numeric(14, 2) not null check (principal > 0),
  total_interest numeric(14, 2) not null default 0 check (total_interest >= 0),
  annual_rate numeric(7, 4) not null default 0 check (annual_rate >= 0 and annual_rate < 200),
  installments smallint not null check (installments between 1 and 72),
  is_prior boolean not null default false, -- true: diferido anterior a la app (no es gasto del período)
  status text not null default 'active' check (status in ('active', 'void')),
  notes text check (char_length(notes) <= 500),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index credit_card_purchases_card_idx on public.credit_card_purchases (credit_card_id);

create trigger credit_card_purchases_updated_at before update on public.credit_card_purchases
  for each row execute function public.set_updated_at();
create trigger credit_card_purchases_audit after insert or update or delete on public.credit_card_purchases
  for each row execute function public.audit_row();

alter table public.credit_card_purchases enable row level security;
create policy "purchases_select_own" on public.credit_card_purchases for select using (user_id = auth.uid());
create policy "purchases_insert_own" on public.credit_card_purchases for insert with check (user_id = auth.uid());
create policy "purchases_update_own" on public.credit_card_purchases for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.installment_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  purchase_id uuid not null references public.credit_card_purchases (id) on delete cascade,
  number smallint not null check (number >= 1),
  due_date date not null,
  principal numeric(14, 2) not null check (principal >= 0),
  interest numeric(14, 2) not null default 0 check (interest >= 0),
  amount numeric(14, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (purchase_id, number),
  constraint installment_amount_sum check (amount = principal + interest)
);

create index installment_schedules_due_idx on public.installment_schedules (user_id, due_date);

alter table public.installment_schedules enable row level security;
create policy "installments_select_own" on public.installment_schedules for select using (user_id = auth.uid());
create policy "installments_insert_own" on public.installment_schedules for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Préstamos y deudas
-- ---------------------------------------------------------------------
create table public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lender text not null check (char_length(lender) between 1 and 80),
  name text not null check (char_length(name) between 1 and 60),
  loan_type text not null check (loan_type in ('amortized', 'simple')),
  original_principal numeric(14, 2) check (original_principal > 0),
  outstanding_start numeric(14, 2) not null check (outstanding_start > 0),
  annual_rate numeric(7, 4) not null default 0 check (annual_rate >= 0 and annual_rate < 200),
  frequency text check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly')),
  installments_count smallint check (installments_count between 1 and 600),
  start_date date not null,
  first_due_date date,
  account_id uuid references public.accounts (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paid', 'void')),
  notes text check (char_length(notes) <= 500),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loans_amortized_fields check (
    loan_type = 'simple'
    or (frequency is not null and installments_count is not null and first_due_date is not null)
  )
);

create index loans_user_idx on public.loans (user_id);

create trigger loans_updated_at before update on public.loans
  for each row execute function public.set_updated_at();
create trigger loans_audit after insert or update or delete on public.loans
  for each row execute function public.audit_row();

alter table public.loans enable row level security;
create policy "loans_select_own" on public.loans for select using (user_id = auth.uid());
create policy "loans_insert_own" on public.loans for insert with check (user_id = auth.uid());
create policy "loans_update_own" on public.loans for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.loan_installments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  loan_id uuid not null references public.loans (id) on delete cascade,
  number smallint not null check (number >= 1),
  due_date date not null,
  principal numeric(14, 2) not null check (principal >= 0),
  interest numeric(14, 2) not null default 0 check (interest >= 0),
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  paid_on date,
  payment_group_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_id, number),
  constraint loan_installment_amount_sum check (amount = principal + interest),
  constraint loan_installment_paid_fields check (
    (status = 'paid' and paid_on is not null and payment_group_id is not null)
    or (status = 'pending' and paid_on is null and payment_group_id is null)
  )
);

create index loan_installments_due_idx on public.loan_installments (user_id, due_date) where status = 'pending';

create trigger loan_installments_updated_at before update on public.loan_installments
  for each row execute function public.set_updated_at();

alter table public.loan_installments enable row level security;
create policy "loan_installments_select_own" on public.loan_installments for select using (user_id = auth.uid());
create policy "loan_installments_insert_own" on public.loan_installments for insert with check (user_id = auth.uid());
create policy "loan_installments_update_own" on public.loan_installments for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Propiedad de referencias en tablas de Fase 2 (RLS no valida FKs hacia filas ajenas).
create or replace function public.validate_phase2_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'credit_cards' then
    if new.institution_id is not null and not exists (
         select 1 from public.financial_institutions i
          where i.id = new.institution_id and (i.user_id is null or i.user_id = new.user_id)) then
      raise exception 'Institución inválida' using errcode = '42501';
    end if;
  elsif tg_table_name = 'credit_card_purchases' then
    if not exists (select 1 from public.credit_cards c where c.id = new.credit_card_id and c.user_id = new.user_id) then
      raise exception 'La tarjeta no pertenece al usuario' using errcode = '42501';
    end if;
    if new.category_id is not null and not exists (
         select 1 from public.transaction_categories c
          where c.id = new.category_id and c.user_id = new.user_id and c.kind = 'expense') then
      raise exception 'Categoría inválida' using errcode = '22023';
    end if;
  elsif tg_table_name = 'installment_schedules' then
    if not exists (select 1 from public.credit_card_purchases p where p.id = new.purchase_id and p.user_id = new.user_id) then
      raise exception 'Compra inválida' using errcode = '42501';
    end if;
  elsif tg_table_name = 'loans' then
    if new.account_id is not null and not exists (
         select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id) then
      raise exception 'La cuenta no pertenece al usuario' using errcode = '42501';
    end if;
  elsif tg_table_name = 'loan_installments' then
    if not exists (select 1 from public.loans l where l.id = new.loan_id and l.user_id = new.user_id) then
      raise exception 'Préstamo inválido' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.validate_phase2_refs() from public, anon, authenticated;

create trigger credit_cards_validate before insert or update on public.credit_cards
  for each row execute function public.validate_phase2_refs();
create trigger credit_card_purchases_validate before insert or update on public.credit_card_purchases
  for each row execute function public.validate_phase2_refs();
create trigger installment_schedules_validate before insert or update on public.installment_schedules
  for each row execute function public.validate_phase2_refs();
create trigger loans_validate before insert or update on public.loans
  for each row execute function public.validate_phase2_refs();
create trigger loan_installments_validate before insert or update on public.loan_installments
  for each row execute function public.validate_phase2_refs();

-- ---------------------------------------------------------------------
-- Reglas recurrentes (suscripciones, servicios, ingresos periódicos)
-- No generan dinero ni gastos por sí solas: solo cuando se "registran".
-- ---------------------------------------------------------------------
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  name text not null check (char_length(name) between 1 and 80),
  amount numeric(14, 2) not null check (amount > 0),
  category_id uuid not null references public.transaction_categories (id) on delete restrict,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly', 'yearly')),
  next_date date not null,
  anchor_day smallint not null check (anchor_day between 1 and 31),
  account_id uuid references public.accounts (id) on delete set null,
  credit_card_id uuid references public.credit_cards (id) on delete set null,
  is_subscription boolean not null default false,
  is_active boolean not null default true,
  notes text check (char_length(notes) <= 500),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_one_source check (not (account_id is not null and credit_card_id is not null)),
  constraint recurring_income_no_card check (kind = 'expense' or credit_card_id is null)
);

create index recurring_rules_user_idx on public.recurring_rules (user_id, next_date) where is_active;

create trigger recurring_rules_updated_at before update on public.recurring_rules
  for each row execute function public.set_updated_at();
create trigger recurring_rules_audit after insert or update or delete on public.recurring_rules
  for each row execute function public.audit_row();

alter table public.recurring_rules enable row level security;
create policy "recurring_select_own" on public.recurring_rules for select using (user_id = auth.uid());
create policy "recurring_insert_own" on public.recurring_rules for insert with check (user_id = auth.uid());
create policy "recurring_update_own" on public.recurring_rules for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "recurring_delete_own" on public.recurring_rules for delete using (user_id = auth.uid());

-- Validación de propiedad para reglas recurrentes.
create or replace function public.validate_recurring_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.transaction_categories c
                  where c.id = new.category_id and c.user_id = new.user_id and c.kind = new.kind) then
    raise exception 'Categoría inválida para la regla' using errcode = '22023';
  end if;
  if new.account_id is not null and not exists (
       select 1 from public.accounts a where a.id = new.account_id and a.user_id = new.user_id) then
    raise exception 'La cuenta no pertenece al usuario' using errcode = '42501';
  end if;
  if new.credit_card_id is not null and not exists (
       select 1 from public.credit_cards c where c.id = new.credit_card_id and c.user_id = new.user_id) then
    raise exception 'La tarjeta no pertenece al usuario' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger recurring_rules_validate before insert or update on public.recurring_rules
  for each row execute function public.validate_recurring_refs();

-- ---------------------------------------------------------------------
-- Extensión del libro de movimientos
-- ---------------------------------------------------------------------
alter table public.financial_transactions
  alter column account_id drop not null,
  add column credit_card_id uuid references public.credit_cards (id) on delete restrict,
  add column card_purchase_id uuid references public.credit_card_purchases (id) on delete restrict,
  add column loan_id uuid references public.loans (id) on delete restrict,
  add column loan_installment_id uuid references public.loan_installments (id) on delete set null,
  add column recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  add column payment_group_id uuid,
  add column payment_kind text check (payment_kind in ('minimum', 'period', 'total', 'other'));

alter table public.financial_transactions
  drop constraint financial_transactions_kind_check,
  drop constraint tx_direction_by_kind,
  drop constraint tx_transfer_counter,
  drop constraint tx_category_by_kind,
  drop constraint tx_expense_fields;

alter table public.financial_transactions
  add constraint financial_transactions_kind_check check (kind in (
    'opening', 'income', 'expense', 'transfer', 'adjustment',
    'card_opening', 'card_payment', 'loan_disbursement', 'loan_payment'
  )),
  add constraint tx_direction_by_kind check (
    (kind = 'income' and direction = 1)
    or (kind in ('expense', 'transfer', 'card_opening', 'card_payment', 'loan_payment') and direction = -1)
    or (kind = 'loan_disbursement' and direction = 1)
    or kind in ('opening', 'adjustment')
  ),
  add constraint tx_source_by_kind check (
    case
      when kind in ('expense', 'adjustment') then (account_id is null) <> (credit_card_id is null)
      when kind = 'card_opening' then account_id is null and credit_card_id is not null
      when kind = 'card_payment' then account_id is not null and credit_card_id is not null
      else account_id is not null and credit_card_id is null
    end
  ),
  add constraint tx_transfer_counter check (
    (kind = 'transfer' and counter_account_id is not null and counter_account_id <> account_id)
    or (kind <> 'transfer' and counter_account_id is null)
  ),
  add constraint tx_category_by_kind check (
    (kind in ('income', 'expense') and category_id is not null)
    or (kind not in ('income', 'expense') and category_id is null)
  ),
  add constraint tx_expense_fields check (
    (kind = 'expense' and credit_card_id is not null and payment_method = 'card')
    or (kind = 'expense' and credit_card_id is null and (payment_method is null or payment_method <> 'card'))
    or (kind <> 'expense' and payment_method is null and expense_type is null)
  ),
  add constraint tx_loan_refs check (
    (kind in ('loan_disbursement', 'loan_payment') and loan_id is not null)
    or kind = 'expense'                       -- intereses de un préstamo (opcional)
    or (kind not in ('loan_disbursement', 'loan_payment', 'expense') and loan_id is null)
  ),
  add constraint tx_payment_kind check (payment_kind is null or kind = 'card_payment');

create index financial_transactions_card_idx on public.financial_transactions (credit_card_id)
  where credit_card_id is not null;
create index financial_transactions_purchase_idx on public.financial_transactions (card_purchase_id)
  where card_purchase_id is not null;
create index financial_transactions_loan_idx on public.financial_transactions (loan_id)
  where loan_id is not null;
create index financial_transactions_group_idx on public.financial_transactions (payment_group_id)
  where payment_group_id is not null;
-- Una sola deuda inicial "suelta" vigente por tarjeta (los diferidos previos van aparte).
create unique index financial_transactions_one_card_opening
  on public.financial_transactions (credit_card_id)
  where kind = 'card_opening' and status <> 'void' and card_purchase_id is null;

-- Validación de propiedad extendida.
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
  if new.account_id is not null then
    select user_id, currency into v_acc from public.accounts where id = new.account_id;
    if v_acc.user_id is distinct from new.user_id then
      raise exception 'La cuenta no pertenece al usuario' using errcode = '42501';
    end if;
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

  if new.credit_card_id is not null and not exists (
       select 1 from public.credit_cards c where c.id = new.credit_card_id and c.user_id = new.user_id) then
    raise exception 'La tarjeta no pertenece al usuario' using errcode = '42501';
  end if;

  if new.card_purchase_id is not null and not exists (
       select 1 from public.credit_card_purchases p
        where p.id = new.card_purchase_id and p.user_id = new.user_id and p.credit_card_id = new.credit_card_id) then
    raise exception 'Compra de tarjeta inválida' using errcode = '42501';
  end if;

  if new.loan_id is not null and not exists (
       select 1 from public.loans l where l.id = new.loan_id and l.user_id = new.user_id) then
    raise exception 'El préstamo no pertenece al usuario' using errcode = '42501';
  end if;

  if new.recurring_rule_id is not null and not exists (
       select 1 from public.recurring_rules r where r.id = new.recurring_rule_id and r.user_id = new.user_id) then
    raise exception 'La regla recurrente no pertenece al usuario' using errcode = '42501';
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
    if (old.payment_group_id is not null or old.card_purchase_id is not null)
       and new.status <> 'void'
       and (new.amount, new.account_id, new.credit_card_id, new.occurred_on)
           is distinct from (old.amount, old.account_id, old.credit_card_id, old.occurred_on) then
      raise exception 'Este movimiento forma parte de un pago o compra diferida; anúlalo y regístralo de nuevo'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Vistas de deuda (security_invoker → respetan RLS)
-- ---------------------------------------------------------------------
create or replace view public.card_balances
with (security_invoker = true)
as
select
  c.id as credit_card_id,
  c.user_id,
  coalesce(sum(
    case
      when t.kind = 'card_payment' then -t.amount
      else -t.direction * t.amount
    end
  ) filter (where t.status = 'confirmed'), 0)::numeric(14, 2) as debt
from public.credit_cards c
left join public.financial_transactions t on t.credit_card_id = c.id
group by c.id, c.user_id;

create or replace view public.loan_balances
with (security_invoker = true)
as
select
  l.id as loan_id,
  l.user_id,
  greatest(
    l.outstanding_start - coalesce(sum(t.amount) filter (where t.kind = 'loan_payment' and t.status = 'confirmed'), 0),
    0
  )::numeric(14, 2) as outstanding,
  coalesce(sum(t.amount) filter (where t.kind = 'loan_payment' and t.status = 'confirmed'), 0)::numeric(14, 2)
    as principal_paid,
  coalesce(sum(t.amount) filter (where t.kind = 'expense' and t.status = 'confirmed'), 0)::numeric(14, 2)
    as interest_paid
from public.loans l
left join public.financial_transactions t on t.loan_id = l.id
group by l.id, l.user_id, l.outstanding_start;

-- ---------------------------------------------------------------------
-- Categoría para intereses y comisiones (nuevos y existentes)
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
    (p_user, 'Intereses y comisiones', 'expense', '#b91c1c', 'percent'),
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

revoke execute on function public.seed_default_categories(uuid) from public, anon, authenticated;

insert into public.transaction_categories (user_id, name, kind, color, icon)
select p.id, 'Intereses y comisiones', 'expense', '#b91c1c', 'percent'
from public.profiles p
on conflict do nothing;

-- Devuelve (o crea) la categoría de intereses del usuario autenticado.
create or replace function public.interest_category_id()
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.transaction_categories
   where user_id = auth.uid() and kind = 'expense' and lower(name) = lower('Intereses y comisiones');
  if v_id is null then
    insert into public.transaction_categories (name, kind, color, icon)
    values ('Intereses y comisiones', 'expense', '#b91c1c', 'percent')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Alta de tarjeta con deuda inicial
-- ---------------------------------------------------------------------
create or replace function public.create_credit_card(
  p_name text,
  p_institution_id uuid,
  p_network text,
  p_credit_limit numeric,
  p_statement_day int,
  p_due_day int,
  p_last4 text,
  p_color text,
  p_opening_debt numeric,
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
  insert into public.credit_cards (name, institution_id, network, credit_limit, statement_day, due_day, last4, color)
  values (p_name, p_institution_id, p_network, p_credit_limit, p_statement_day, p_due_day, nullif(p_last4, ''), p_color)
  returning id into v_id;

  if p_opening_debt is not null and p_opening_debt > 0 then
    insert into public.financial_transactions (kind, status, credit_card_id, amount, direction, occurred_on, description)
    values ('card_opening', 'confirmed', v_id, p_opening_debt, -1, p_opening_date, 'Deuda inicial de la tarjeta');
  end if;
  return v_id;
end;
$$;

create or replace function public.set_card_opening_debt(p_card_id uuid, p_amount numeric, p_date date)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.financial_transactions
     set status = 'void'
   where credit_card_id = p_card_id and kind = 'card_opening' and card_purchase_id is null and status <> 'void';

  if p_amount is not null and p_amount > 0 then
    insert into public.financial_transactions (kind, status, credit_card_id, amount, direction, occurred_on, description)
    values ('card_opening', 'confirmed', p_card_id, p_amount, -1, p_date, 'Deuda inicial de la tarjeta');
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Compra con tarjeta diferida (o diferido previo a la app)
-- p_schedule: [{"number":1,"due_date":"2026-11-15","principal":"100.00","interest":"0.00"}, ...]
-- El cronograma lo calcula el servidor de la app; aquí se valida que cuadre.
-- ---------------------------------------------------------------------
create or replace function public.create_card_purchase(
  p_card_id uuid,
  p_category_id uuid,
  p_description text,
  p_merchant text,
  p_purchase_date date,
  p_principal numeric,
  p_annual_rate numeric,
  p_is_prior boolean,
  p_notes text,
  p_schedule jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_purchase uuid;
  v_count int := jsonb_array_length(p_schedule);
  v_sum_principal numeric;
  v_sum_interest numeric;
  v_interest_cat uuid;
begin
  if v_count < 1 then
    raise exception 'El cronograma está vacío' using errcode = '22023';
  end if;
  if not p_is_prior and p_category_id is null then
    raise exception 'La categoría es obligatoria' using errcode = '22023';
  end if;

  select sum((e->>'principal')::numeric), sum((e->>'interest')::numeric)
    into v_sum_principal, v_sum_interest
    from jsonb_array_elements(p_schedule) e;

  if v_sum_principal <> p_principal then
    raise exception 'El cronograma no cuadra con el capital (% vs %)', v_sum_principal, p_principal using errcode = '22023';
  end if;

  insert into public.credit_card_purchases
    (credit_card_id, category_id, description, merchant, purchase_date, principal, total_interest,
     annual_rate, installments, is_prior, notes)
  values
    (p_card_id, case when p_is_prior then null else p_category_id end, p_description, nullif(p_merchant, ''),
     p_purchase_date, p_principal, v_sum_interest, coalesce(p_annual_rate, 0), v_count, p_is_prior, nullif(p_notes, ''))
  returning id into v_purchase;

  insert into public.installment_schedules (user_id, purchase_id, number, due_date, principal, interest, amount)
  select auth.uid(), v_purchase, (e->>'number')::smallint, (e->>'due_date')::date,
         (e->>'principal')::numeric, (e->>'interest')::numeric,
         (e->>'principal')::numeric + (e->>'interest')::numeric
    from jsonb_array_elements(p_schedule) e;

  if p_is_prior then
    -- Deuda anterior a la app: entra a la deuda, NO es gasto del período.
    insert into public.financial_transactions
      (kind, status, credit_card_id, card_purchase_id, amount, direction, occurred_on, description)
    values
      ('card_opening', 'confirmed', p_card_id, v_purchase, p_principal + v_sum_interest, -1, p_purchase_date,
       'Diferido previo: ' || p_description);
  else
    -- El consumo se reconoce UNA sola vez, en la fecha de compra.
    insert into public.financial_transactions
      (kind, status, credit_card_id, card_purchase_id, category_id, amount, direction, occurred_on,
       description, payment_method, expense_type, notes)
    values
      ('expense', 'confirmed', p_card_id, v_purchase, p_category_id, p_principal, -1, p_purchase_date,
       p_description, 'card', 'variable', nullif(p_notes, ''));

    if v_sum_interest > 0 then
      v_interest_cat := public.interest_category_id();
      insert into public.financial_transactions
        (kind, status, credit_card_id, card_purchase_id, category_id, amount, direction, occurred_on,
         description, payment_method, expense_type)
      values
        ('expense', 'confirmed', p_card_id, v_purchase, v_interest_cat, v_sum_interest, -1, p_purchase_date,
         'Intereses diferido: ' || p_description, 'card', 'fixed');
    end if;
  end if;

  return v_purchase;
end;
$$;

-- ---------------------------------------------------------------------
-- Préstamos
-- p_schedule igual que en tarjetas; vacío para deudas simples.
-- ---------------------------------------------------------------------
create or replace function public.create_loan(
  p_lender text,
  p_name text,
  p_loan_type text,
  p_original_principal numeric,
  p_outstanding numeric,
  p_annual_rate numeric,
  p_frequency text,
  p_start_date date,
  p_first_due_date date,
  p_account_id uuid,
  p_notes text,
  p_disburse boolean,
  p_schedule jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_loan uuid;
  v_count int := coalesce(jsonb_array_length(p_schedule), 0);
  v_sum numeric;
begin
  if p_loan_type = 'amortized' then
    if v_count < 1 then
      raise exception 'El cronograma está vacío' using errcode = '22023';
    end if;
    select sum((e->>'principal')::numeric) into v_sum from jsonb_array_elements(p_schedule) e;
    if v_sum <> p_outstanding then
      raise exception 'El cronograma no cuadra con el saldo (% vs %)', v_sum, p_outstanding using errcode = '22023';
    end if;
  end if;
  if p_disburse and p_account_id is null then
    raise exception 'Indica la cuenta donde recibiste el préstamo' using errcode = '22023';
  end if;

  insert into public.loans
    (lender, name, loan_type, original_principal, outstanding_start, annual_rate, frequency,
     installments_count, start_date, first_due_date, account_id, notes)
  values
    (p_lender, p_name, p_loan_type, p_original_principal, p_outstanding, coalesce(p_annual_rate, 0),
     case when p_loan_type = 'amortized' then p_frequency end,
     case when p_loan_type = 'amortized' then v_count end,
     p_start_date, case when p_loan_type = 'amortized' then p_first_due_date end, p_account_id, nullif(p_notes, ''))
  returning id into v_loan;

  if p_loan_type = 'amortized' then
    insert into public.loan_installments (user_id, loan_id, number, due_date, principal, interest, amount)
    select auth.uid(), v_loan, (e->>'number')::smallint, (e->>'due_date')::date,
           (e->>'principal')::numeric, (e->>'interest')::numeric,
           (e->>'principal')::numeric + (e->>'interest')::numeric
      from jsonb_array_elements(p_schedule) e;
  end if;

  if p_disburse then
    -- Préstamo recibido: entra dinero a la cuenta, pero NO es ingreso.
    insert into public.financial_transactions
      (kind, status, account_id, loan_id, amount, direction, occurred_on, description)
    values
      ('loan_disbursement', 'confirmed', p_account_id, v_loan, p_outstanding, 1, p_start_date,
       'Desembolso: ' || p_name);
  end if;

  return v_loan;
end;
$$;

-- Pago de préstamo: capital (no es gasto) + intereses/cargos (sí es gasto),
-- agrupados para anularse juntos. Si se indica cuota, la marca como pagada.
create or replace function public.pay_loan(
  p_loan_id uuid,
  p_installment_id uuid,
  p_account_id uuid,
  p_date date,
  p_principal numeric,
  p_interest numeric,
  p_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_group uuid := gen_random_uuid();
  v_loan record;
  v_outstanding numeric;
  v_inst_status text;
  v_inst_num int;
begin
  select l.*, b.outstanding into v_loan
    from public.loans l join public.loan_balances b on b.loan_id = l.id
   where l.id = p_loan_id;
  if v_loan.id is null then
    raise exception 'Préstamo no encontrado' using errcode = '42501';
  end if;
  if v_loan.status <> 'active' then
    raise exception 'El préstamo no está activo' using errcode = '22023';
  end if;
  if coalesce(p_principal, 0) < 0 or coalesce(p_interest, 0) < 0 or coalesce(p_principal, 0) + coalesce(p_interest, 0) <= 0 then
    raise exception 'El pago debe ser mayor que 0' using errcode = '22023';
  end if;
  if coalesce(p_principal, 0) > v_loan.outstanding then
    raise exception 'El abono a capital (%) supera el saldo pendiente (%)', p_principal, v_loan.outstanding
      using errcode = '22023';
  end if;

  if p_installment_id is not null then
    select status, number into v_inst_status, v_inst_num from public.loan_installments
     where id = p_installment_id and loan_id = p_loan_id for update;
    if v_inst_status is null then
      raise exception 'Cuota no encontrada' using errcode = '42501';
    end if;
    if v_inst_status <> 'pending' then
      raise exception 'La cuota ya está pagada' using errcode = '22023';
    end if;
  end if;

  if coalesce(p_principal, 0) > 0 then
    insert into public.financial_transactions
      (kind, status, account_id, loan_id, loan_installment_id, payment_group_id, amount, direction, occurred_on,
       description, notes)
    values
      ('loan_payment', 'confirmed', p_account_id, p_loan_id, p_installment_id, v_group, p_principal, -1, p_date,
       'Abono a capital: ' || v_loan.name ||
         coalesce(' (cuota ' || v_inst_num || ')', ''), nullif(p_notes, ''));
  end if;

  if coalesce(p_interest, 0) > 0 then
    insert into public.financial_transactions
      (kind, status, account_id, loan_id, loan_installment_id, payment_group_id, category_id, amount, direction,
       occurred_on, description, payment_method, expense_type)
    values
      ('expense', 'confirmed', p_account_id, p_loan_id, p_installment_id, v_group, public.interest_category_id(),
       p_interest, -1, p_date,
       'Intereses y cargos: ' || v_loan.name || coalesce(' (cuota ' || v_inst_num || ')', ''),
       'transfer', 'fixed');
  end if;

  if p_installment_id is not null then
    update public.loan_installments
       set status = 'paid', paid_on = p_date, payment_group_id = v_group
     where id = p_installment_id;
  end if;

  select outstanding into v_outstanding from public.loan_balances where loan_id = p_loan_id;
  if v_outstanding = 0 then
    update public.loans set status = 'paid' where id = p_loan_id;
  end if;

  return v_group;
end;
$$;

-- ---------------------------------------------------------------------
-- Recurrencias
-- ---------------------------------------------------------------------
create or replace function public.next_occurrence(p_date date, p_frequency text, p_anchor int)
returns date
language plpgsql
immutable
as $$
declare
  v_next date;
  v_last int;
  v_day int := extract(day from p_date);
begin
  if p_frequency = 'weekly' then
    return p_date + 7;
  elsif p_frequency = 'biweekly' then
    return p_date + 14;
  elsif p_frequency = 'semimonthly' then
    -- Quincenal: alterna entre el día ancla (≤ 15) y 15 días después.
    v_last := extract(day from (date_trunc('month', p_date) + interval '1 month - 1 day'));
    if v_day < 16 then
      return make_date(extract(year from p_date)::int, extract(month from p_date)::int, least(v_day + 15, v_last));
    end if;
    v_next := (date_trunc('month', p_date) + interval '1 month')::date;
    return make_date(extract(year from v_next)::int, extract(month from v_next)::int, least(p_anchor, 15));
  elsif p_frequency = 'monthly' then
    v_next := (date_trunc('month', p_date) + interval '1 month')::date;
  elsif p_frequency = 'yearly' then
    v_next := (date_trunc('month', p_date) + interval '1 year')::date;
  else
    raise exception 'Frecuencia inválida %', p_frequency;
  end if;
  v_last := extract(day from (v_next + interval '1 month - 1 day'));
  return make_date(extract(year from v_next)::int, extract(month from v_next)::int, least(p_anchor, v_last));
end;
$$;

-- Registra la ocurrencia actual de una regla como movimiento real y avanza la fecha.
create or replace function public.register_recurring(
  p_rule_id uuid,
  p_date date,
  p_amount numeric,
  p_account_id uuid,
  p_credit_card_id uuid,
  p_status text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rule record;
  v_tx uuid;
begin
  select * into v_rule from public.recurring_rules where id = p_rule_id for update;
  if v_rule.id is null then
    raise exception 'Regla no encontrada' using errcode = '42501';
  end if;
  if p_status not in ('pending', 'confirmed') then
    raise exception 'Estado inválido' using errcode = '22023';
  end if;
  if (p_account_id is null) = (p_credit_card_id is null) then
    raise exception 'Indica una cuenta o una tarjeta' using errcode = '22023';
  end if;
  if v_rule.kind = 'income' and p_credit_card_id is not null then
    raise exception 'Un ingreso no puede ir a una tarjeta' using errcode = '22023';
  end if;

  insert into public.financial_transactions
    (kind, status, account_id, credit_card_id, category_id, recurring_rule_id, amount, direction, occurred_on,
     description, payment_method, expense_type)
  values
    (v_rule.kind, p_status, p_account_id, p_credit_card_id, v_rule.category_id, v_rule.id, p_amount,
     case when v_rule.kind = 'income' then 1 else -1 end, p_date, v_rule.name,
     case when v_rule.kind = 'expense' then (case when p_credit_card_id is not null then 'card' else 'debit' end) end,
     case when v_rule.kind = 'expense' then 'fixed' end)
  returning id into v_tx;

  update public.recurring_rules
     set next_date = public.next_occurrence(v_rule.next_date, v_rule.frequency, v_rule.anchor_day)
   where id = v_rule.id;

  return v_tx;
end;
$$;

create or replace function public.skip_recurring(p_rule_id uuid)
returns date
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_next date;
begin
  update public.recurring_rules
     set next_date = public.next_occurrence(next_date, frequency, anchor_day)
   where id = p_rule_id
  returning next_date into v_next;
  if v_next is null then
    raise exception 'Regla no encontrada' using errcode = '42501';
  end if;
  return v_next;
end;
$$;

-- ---------------------------------------------------------------------
-- Anulación consistente
--   * Movimiento de un pago agrupado (préstamo): anula todo el grupo y la cuota vuelve a pendiente.
--   * Movimiento de una compra diferida: anula la compra completa (gasto, intereses y cronograma).
--   * Resto: anula solo el movimiento.
-- ---------------------------------------------------------------------
create or replace function public.void_transaction(p_id uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tx record;
  v_count int;
begin
  select * into v_tx from public.financial_transactions where id = p_id;
  if v_tx.id is null or v_tx.status = 'void' then
    raise exception 'El movimiento no existe o ya está anulado' using errcode = '22023';
  end if;
  if v_tx.kind = 'opening' then
    raise exception 'El saldo inicial se cambia desde la cuenta' using errcode = '22023';
  end if;

  if v_tx.payment_group_id is not null then
    update public.financial_transactions set status = 'void'
     where payment_group_id = v_tx.payment_group_id and status <> 'void';
    get diagnostics v_count = row_count;
    update public.loan_installments
       set status = 'pending', paid_on = null, payment_group_id = null
     where payment_group_id = v_tx.payment_group_id;
    if v_tx.loan_id is not null then
      update public.loans set status = 'active' where id = v_tx.loan_id and status = 'paid';
    end if;
  elsif v_tx.card_purchase_id is not null then
    update public.financial_transactions set status = 'void'
     where card_purchase_id = v_tx.card_purchase_id and status <> 'void';
    get diagnostics v_count = row_count;
    update public.credit_card_purchases set status = 'void' where id = v_tx.card_purchase_id;
  else
    update public.financial_transactions set status = 'void' where id = p_id;
    get diagnostics v_count = row_count;
  end if;
  return v_count;
end;
$$;

-- La compra anulada se oculta del cronograma de cuotas.
-- (Lectura desde la app filtra por purchases.status = 'active'.)

-- ---------------------------------------------------------------------
-- Datos demo: incluir tarjetas, préstamos y recurrentes en el borrado
-- ---------------------------------------------------------------------
create or replace function public.clear_demo_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  if exists (
    select 1
      from public.financial_transactions t
      left join public.accounts a on a.id in (t.account_id, t.counter_account_id)
      left join public.credit_cards c on c.id = t.credit_card_id
      left join public.loans l on l.id = t.loan_id
     where t.user_id = v_user and not t.is_demo and (a.is_demo or c.is_demo or l.is_demo)
  ) then
    raise exception 'Hay movimientos reales registrados en elementos demo; anúlalos antes de borrar la demo'
      using errcode = '23503';
  end if;

  delete from public.financial_transactions where user_id = v_user and is_demo;
  delete from public.recurring_rules where user_id = v_user and is_demo;
  delete from public.loans where user_id = v_user and is_demo;
  delete from public.credit_card_purchases where user_id = v_user and is_demo;
  delete from public.credit_cards where user_id = v_user and is_demo;
  delete from public.accounts where user_id = v_user and is_demo;
end;
$$;

-- Datos demo de Fase 2: tarjeta con consumo y diferido, suscripción y préstamo.
-- Se agregan a la demo de la Fase 1 (load_demo_data) y se marcan is_demo.
create or replace function public.load_demo_data_phase2()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'America/Guayaquil')::date;
  v_bank uuid;
  v_card uuid;
  v_purchase uuid;
  v_loan uuid;
  v_food uuid;
  v_shop uuid;
  v_subs uuid;
  v_first date;
begin
  select id into v_bank from public.accounts where user_id = v_user and is_demo and account_type = 'savings' limit 1;
  select id into v_food from public.transaction_categories where user_id = v_user and kind = 'expense' and name = 'Alimentación';
  select id into v_shop from public.transaction_categories where user_id = v_user and kind = 'expense' and name = 'Compras';
  select id into v_subs from public.transaction_categories where user_id = v_user and kind = 'expense' and name = 'Suscripciones';
  if v_bank is null or v_food is null or v_shop is null or v_subs is null then
    return;
  end if;

  v_card := public.create_credit_card('Demo · Visa', null, 'visa', 1500, 20, 5, '4242', '#1e1b4b', 120, v_today - 20);
  update public.credit_cards set is_demo = true where id = v_card;

  insert into public.financial_transactions
    (kind, credit_card_id, category_id, amount, direction, occurred_on, description, payment_method, expense_type, is_demo)
  values ('expense', v_card, v_food, 45.60, -1, v_today - 3, 'Restaurante (demo)', 'card', 'variable', true);

  v_first := (date_trunc('month', v_today) + interval '1 month' + interval '4 days')::date;
  v_purchase := public.create_card_purchase(v_card, v_shop, 'Celular diferido (demo)', null, v_today - 2, 600, 0, false, null,
    (select jsonb_agg(jsonb_build_object(
       'number', g, 'due_date', (v_first + make_interval(months => g - 1))::date,
       'principal', '100.00', 'interest', '0.00'))
     from generate_series(1, 6) g));
  update public.credit_card_purchases set is_demo = true where id = v_purchase;

  insert into public.recurring_rules
    (kind, name, amount, category_id, frequency, next_date, anchor_day, credit_card_id, is_subscription, is_demo)
  values ('expense', 'Streaming (demo)', 10.99, v_subs, 'monthly', v_today + 6,
          extract(day from v_today + 6)::int, v_card, true, true);

  v_loan := public.create_loan('Banco demo', 'Préstamo (demo)', 'amortized', 2000, 1200, 14, 'monthly', v_today - 200,
    (date_trunc('month', v_today) + interval '1 month' + interval '14 days')::date, v_bank, null, false,
    (select jsonb_agg(jsonb_build_object(
       'number', g,
       'due_date', ((date_trunc('month', v_today) + interval '1 month' + interval '14 days')::date + make_interval(months => g - 1))::date,
       'principal', '200.00', 'interest', to_char(round((1200 - 200 * (g - 1)) * 0.14 / 12, 2), 'FM999990.00')))
     from generate_series(1, 6) g));
  update public.loans set is_demo = true where id = v_loan;

  update public.financial_transactions set is_demo = true
   where user_id = v_user and (credit_card_id = v_card or loan_id = v_loan);
end;
$$;

create or replace function public.load_demo_data_all()
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.load_demo_data();
  perform public.load_demo_data_phase2();
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
revoke execute on function public.validate_recurring_refs() from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.interest_category_id()',
    'public.create_credit_card(text, uuid, text, numeric, int, int, text, text, numeric, date)',
    'public.set_card_opening_debt(uuid, numeric, date)',
    'public.create_card_purchase(uuid, uuid, text, text, date, numeric, numeric, boolean, text, jsonb)',
    'public.create_loan(text, text, text, numeric, numeric, numeric, text, date, date, uuid, text, boolean, jsonb)',
    'public.pay_loan(uuid, uuid, uuid, date, numeric, numeric, text)',
    'public.register_recurring(uuid, date, numeric, uuid, uuid, text)',
    'public.skip_recurring(uuid)',
    'public.void_transaction(uuid)',
    'public.clear_demo_data()',
    'public.load_demo_data_phase2()',
    'public.load_demo_data_all()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
