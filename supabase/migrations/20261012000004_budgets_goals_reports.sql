-- =====================================================================
-- Finanzas Personales — Migración 0004: Fase 3
-- Presupuestos mensuales, metas de ahorro (reservas) y funciones de reportes.
--
-- Metas de ahorro: el dinero asignado a una meta es una RESERVA sobre el
-- saldo de tus cuentas, no un movimiento. No altera saldos ni patrimonio,
-- y la suma reservada nunca puede superar el dinero disponible
-- (evita contar dos veces el mismo dinero).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Presupuestos (por categoría de gasto y mes)
-- ---------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null references public.transaction_categories (id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  amount numeric(14, 2) not null check (amount > 0),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, period_month)
);

create index budgets_user_month_idx on public.budgets (user_id, period_month);

create trigger budgets_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();

alter table public.budgets enable row level security;
create policy "budgets_select_own" on public.budgets for select using (user_id = auth.uid());
create policy "budgets_insert_own" on public.budgets for insert with check (user_id = auth.uid());
create policy "budgets_update_own" on public.budgets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "budgets_delete_own" on public.budgets for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- Metas de ahorro y sus reservas
-- ---------------------------------------------------------------------
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  target_date date,
  color text not null default '#059669' check (color ~ '^#[0-9a-fA-F]{6}$'),
  status text not null default 'active' check (status in ('active', 'archived')),
  notes text check (char_length(notes) <= 500),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index savings_goals_user_idx on public.savings_goals (user_id);

create trigger savings_goals_updated_at before update on public.savings_goals
  for each row execute function public.set_updated_at();
create trigger savings_goals_audit after insert or update or delete on public.savings_goals
  for each row execute function public.audit_row();

alter table public.savings_goals enable row level security;
create policy "goals_select_own" on public.savings_goals for select using (user_id = auth.uid());
create policy "goals_insert_own" on public.savings_goals for insert with check (user_id = auth.uid());
create policy "goals_update_own" on public.savings_goals for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.savings_goal_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid not null references public.savings_goals (id) on delete cascade,
  amount numeric(14, 2) not null check (amount <> 0), -- + reservar, − liberar
  occurred_on date not null,
  note text check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create index savings_goal_movements_goal_idx on public.savings_goal_movements (goal_id);

create trigger savings_goal_movements_audit after insert or update or delete on public.savings_goal_movements
  for each row execute function public.audit_row();

alter table public.savings_goal_movements enable row level security;
create policy "goal_movements_select_own" on public.savings_goal_movements for select using (user_id = auth.uid());
-- Escritura solo vía allocate_to_goal (valida límites).

-- Propiedad de referencias
create or replace function public.validate_phase3_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'budgets' then
    if not exists (select 1 from public.transaction_categories c
                    where c.id = new.category_id and c.user_id = new.user_id and c.kind = 'expense') then
      raise exception 'Categoría de gasto inválida' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.validate_phase3_refs() from public, anon, authenticated;

create trigger budgets_validate before insert or update on public.budgets
  for each row execute function public.validate_phase3_refs();

create or replace view public.goal_balances
with (security_invoker = true)
as
select g.id as goal_id, g.user_id, coalesce(sum(m.amount), 0)::numeric(14, 2) as allocated
from public.savings_goals g
left join public.savings_goal_movements m on m.goal_id = g.id
group by g.id, g.user_id;

-- Reserva/liberación con validaciones de consistencia.
create or replace function public.allocate_to_goal(p_goal_id uuid, p_amount numeric, p_date date, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_goal record;
  v_current numeric;
  v_reserved_total numeric;
  v_available numeric;
begin
  if v_user is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  select * into v_goal from public.savings_goals where id = p_goal_id and user_id = v_user for update;
  if v_goal.id is null then
    raise exception 'Meta no encontrada' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'El importe debe ser distinto de 0' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_current from public.savings_goal_movements where goal_id = p_goal_id;
  if v_current + p_amount < 0 then
    raise exception 'No puedes liberar más de lo reservado (%).', v_current using errcode = '22023';
  end if;

  if p_amount > 0 then
    if v_goal.status <> 'active' then
      raise exception 'La meta está archivada' using errcode = '22023';
    end if;
    select coalesce(sum(m.amount), 0) into v_reserved_total
      from public.savings_goal_movements m
      join public.savings_goals g on g.id = m.goal_id
     where m.user_id = v_user and g.status = 'active';
    select coalesce(sum(b.balance), 0) into v_available
      from public.account_balances b
      join public.accounts a on a.id = b.account_id
     where a.user_id = v_user and a.is_active;
    if v_reserved_total + p_amount > v_available then
      raise exception 'No puedes reservar más dinero del que tienes disponible (sin reservar: %).',
        greatest(v_available - v_reserved_total, 0) using errcode = '22023';
    end if;
  end if;

  insert into public.savings_goal_movements (user_id, goal_id, amount, occurred_on, note)
  values (v_user, p_goal_id, p_amount, p_date, nullif(p_note, ''));
end;
$$;

-- Al archivar una meta se liberan sus reservas (queda trazado).
create or replace function public.archive_goal(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_current numeric;
begin
  if not exists (select 1 from public.savings_goals where id = p_goal_id and user_id = v_user) then
    raise exception 'Meta no encontrada' using errcode = '42501';
  end if;
  select coalesce(sum(amount), 0) into v_current from public.savings_goal_movements where goal_id = p_goal_id;
  if v_current <> 0 then
    insert into public.savings_goal_movements (user_id, goal_id, amount, occurred_on, note)
    values (v_user, p_goal_id, -v_current, (now() at time zone 'America/Guayaquil')::date, 'Liberado al archivar');
  end if;
  update public.savings_goals set status = 'archived' where id = p_goal_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Presupuesto del mes: asignado vs. consumido (gastos confirmados, cuenta o tarjeta)
-- ---------------------------------------------------------------------
create or replace function public.budget_status(p_month date)
returns table (
  budget_id uuid,
  category_id uuid,
  name text,
  color text,
  amount text,
  spent text
)
language sql
stable
security invoker
set search_path = public
as $$
  select b.id, c.id, c.name, c.color, b.amount::text,
         coalesce((
           select sum(t.amount) from public.financial_transactions t
            where t.user_id = auth.uid() and t.kind = 'expense' and t.status = 'confirmed'
              and t.category_id = b.category_id
              and t.occurred_on >= date_trunc('month', p_month)::date
              and t.occurred_on < (date_trunc('month', p_month) + interval '1 month')::date
         ), 0)::numeric(14, 2)::text
    from public.budgets b
    join public.transaction_categories c on c.id = b.category_id
   where b.user_id = auth.uid() and b.period_month = date_trunc('month', p_month)::date
   order by c.name;
$$;

create or replace function public.copy_budgets(p_from date, p_to date)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.budgets (category_id, period_month, amount)
  select category_id, date_trunc('month', p_to)::date, amount
    from public.budgets
   where user_id = auth.uid() and period_month = date_trunc('month', p_from)::date
  on conflict (user_id, category_id, period_month) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Reportes
-- ---------------------------------------------------------------------
-- Ingresos y gastos por mes con filtros opcionales de cuenta (o tarjeta) y categoría.
create or replace function public.report_cashflow(
  p_from date,
  p_to date,
  p_account uuid default null,
  p_category uuid default null
)
returns table (month date, income text, expense text)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as month
  )
  select m.month,
         coalesce(sum(t.amount) filter (where t.kind = 'income'), 0)::numeric(14, 2)::text,
         coalesce(sum(t.amount) filter (where t.kind = 'expense'), 0)::numeric(14, 2)::text
    from months m
    left join public.financial_transactions t
      on t.user_id = auth.uid()
     and t.status = 'confirmed'
     and t.kind in ('income', 'expense')
     and t.occurred_on >= m.month and t.occurred_on < (m.month + interval '1 month')
     and (p_account is null or t.account_id = p_account or t.credit_card_id = p_account)
     and (p_category is null or t.category_id = p_category)
   group by m.month
   order by m.month;
$$;

create or replace function public.report_categories(
  p_from date,
  p_to date,
  p_account uuid default null
)
returns table (category_id uuid, name text, color text, total text, count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.name, c.color, sum(t.amount)::numeric(14, 2)::text, count(*)
    from public.financial_transactions t
    join public.transaction_categories c on c.id = t.category_id
   where t.user_id = auth.uid() and t.kind = 'expense' and t.status = 'confirmed'
     and t.occurred_on between p_from and p_to
     and (p_account is null or t.account_id = p_account or t.credit_card_id = p_account)
   group by c.id, c.name, c.color
   order by sum(t.amount) desc;
$$;

-- Saldo de cuentas activas, deuda de tarjetas y saldo de préstamos al cierre de cada mes.
create or replace function public.report_position(p_from date, p_to date, p_account uuid default null)
returns table (month_end date, assets text, card_debt text, loan_debt text)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select (generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')
            + interval '1 month - 1 day')::date as month_end
  )
  select m.month_end,
    (select coalesce(sum(case
              when t.account_id = a.id then t.direction * t.amount
              when t.kind = 'transfer' and t.counter_account_id = a.id then t.amount
              else 0 end), 0)
       from public.accounts a
       join public.financial_transactions t on (t.account_id = a.id or t.counter_account_id = a.id)
      where a.user_id = auth.uid() and a.is_active and t.status = 'confirmed' and t.occurred_on <= m.month_end
        and (p_account is null or a.id = p_account))::numeric(14, 2)::text,
    (select coalesce(sum(case when t.kind = 'card_payment' then -t.amount else -t.direction * t.amount end), 0)
       from public.financial_transactions t
      where t.user_id = auth.uid() and t.credit_card_id is not null and t.status = 'confirmed'
        and t.occurred_on <= m.month_end)::numeric(14, 2)::text,
    (select coalesce(sum(greatest(l.outstanding_start - coalesce((
              select sum(p.amount) from public.financial_transactions p
               where p.loan_id = l.id and p.kind = 'loan_payment' and p.status = 'confirmed'
                 and p.occurred_on <= m.month_end), 0), 0)), 0)
       from public.loans l
      where l.user_id = auth.uid() and l.status <> 'void' and l.start_date <= m.month_end)::numeric(14, 2)::text
  from months m
  order by m.month_end;
$$;

-- Promedio mensual de gastos variables pagados con cuentas (para la proyección).
create or replace function public.avg_variable_spending(p_months int default 3)
returns table (avg_amount text, months_with_data int)
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select (date_trunc('month', (now() at time zone 'America/Guayaquil')::date) - make_interval(months => g))::date as m
    from generate_series(1, greatest(least(p_months, 12), 1)) g
  ),
  totals as (
    select m.m,
           (select coalesce(sum(t.amount), 0) from public.financial_transactions t
             where t.user_id = auth.uid() and t.kind = 'expense' and t.status = 'confirmed'
               and t.account_id is not null and t.recurring_rule_id is null
               and coalesce(t.expense_type, 'variable') = 'variable' and t.loan_id is null
               and t.occurred_on >= m.m and t.occurred_on < m.m + interval '1 month') as total,
           exists (select 1 from public.financial_transactions t
                    where t.user_id = auth.uid() and t.status = 'confirmed'
                      and t.occurred_on >= m.m and t.occurred_on < m.m + interval '1 month') as has_data
      from months m
  )
  select coalesce(round(avg(total) filter (where has_data), 2), 0)::text,
         count(*) filter (where has_data)::int
    from totals;
$$;

-- ---------------------------------------------------------------------
-- Demo: borrar también metas y presupuestos demo
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

  delete from public.savings_goals where user_id = v_user and is_demo;
  delete from public.budgets where user_id = v_user and is_demo;
  delete from public.financial_transactions where user_id = v_user and is_demo;
  delete from public.recurring_rules where user_id = v_user and is_demo;
  delete from public.loans where user_id = v_user and is_demo;
  delete from public.credit_card_purchases where user_id = v_user and is_demo;
  delete from public.credit_cards where user_id = v_user and is_demo;
  delete from public.accounts where user_id = v_user and is_demo;
end;
$$;

create or replace function public.load_demo_data_all()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_goal uuid;
  v_month date := date_trunc('month', (now() at time zone 'America/Guayaquil')::date)::date;
begin
  perform public.load_demo_data();
  perform public.load_demo_data_phase2();

  insert into public.savings_goals (name, target_amount, target_date, color, is_demo)
  values ('Fondo de emergencia (demo)', 3000, v_month + interval '1 year', '#059669', true)
  returning id into v_goal;
  perform public.allocate_to_goal(v_goal, 250, v_month, 'Reserva inicial (demo)');

  insert into public.budgets (category_id, period_month, is_demo, amount)
  select id, v_month, true, case name when 'Alimentación' then 150 when 'Transporte' then 60 else 100 end
    from public.transaction_categories
   where user_id = v_user and kind = 'expense' and name in ('Alimentación', 'Transporte', 'Entretenimiento')
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.allocate_to_goal(uuid, numeric, date, text)',
    'public.archive_goal(uuid)',
    'public.budget_status(date)',
    'public.copy_budgets(date, date)',
    'public.report_cashflow(date, date, uuid, uuid)',
    'public.report_categories(date, date, uuid)',
    'public.report_position(date, date, uuid)',
    'public.avg_variable_spending(int)',
    'public.clear_demo_data()',
    'public.load_demo_data_all()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
