-- =====================================================================
-- Finanzas Personales — Migración 0002: datos de demostración opcionales
--
-- Los datos demo se marcan con is_demo = true, se cargan solo bajo
-- petición explícita del usuario (Configuración) y se pueden borrar sin
-- tocar los datos reales.
-- =====================================================================

create or replace function public.load_demo_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_bank uuid;
  v_cash uuid;
  v_today date := (now() at time zone 'America/Guayaquil')::date;
  v_month date := date_trunc('month', v_today)::date;
  v_prev date := (date_trunc('month', v_today) - interval '1 month')::date;
  v_cat_salary uuid;
  v_cat_food uuid;
  v_cat_transport uuid;
  v_cat_home uuid;
  v_cat_fun uuid;
begin
  if v_user is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  if exists (select 1 from public.accounts where user_id = v_user and is_demo) then
    raise exception 'Los datos de demostración ya están cargados' using errcode = '23505';
  end if;

  select id into v_cat_salary from public.transaction_categories
   where user_id = v_user and kind = 'income' and name = 'Sueldo';
  select id into v_cat_food from public.transaction_categories
   where user_id = v_user and kind = 'expense' and name = 'Alimentación';
  select id into v_cat_transport from public.transaction_categories
   where user_id = v_user and kind = 'expense' and name = 'Transporte';
  select id into v_cat_home from public.transaction_categories
   where user_id = v_user and kind = 'expense' and name = 'Vivienda';
  select id into v_cat_fun from public.transaction_categories
   where user_id = v_user and kind = 'expense' and name = 'Entretenimiento';

  if v_cat_salary is null or v_cat_food is null or v_cat_transport is null
     or v_cat_home is null or v_cat_fun is null then
    raise exception 'Faltan categorías predeterminadas para cargar la demo' using errcode = 'P0002';
  end if;

  insert into public.accounts (name, account_type, color, icon, is_demo)
  values ('Demo · Cuenta de ahorros', 'savings', '#7c3aed', 'landmark', true)
  returning id into v_bank;

  insert into public.accounts (name, account_type, color, icon, is_demo)
  values ('Demo · Efectivo', 'cash', '#16a34a', 'wallet', true)
  returning id into v_cash;

  insert into public.financial_transactions
    (kind, status, account_id, counter_account_id, category_id, amount, direction, occurred_on,
     description, payment_method, expense_type, is_demo)
  values
    ('opening',  'confirmed', v_bank, null, null,               1200.00,  1, v_prev,              'Saldo inicial', null, null, true),
    ('opening',  'confirmed', v_cash, null, null,                 80.00,  1, v_prev,              'Saldo inicial', null, null, true),
    ('income',   'confirmed', v_bank, null, v_cat_salary,       950.00,  1, v_prev + 14,         'Sueldo (demo)', null, null, true),
    ('expense',  'confirmed', v_bank, null, v_cat_home,         350.00, -1, v_prev + 4,          'Arriendo (demo)', 'transfer', 'fixed', true),
    ('expense',  'confirmed', v_cash, null, v_cat_food,          42.35, -1, v_prev + 9,          'Supermercado (demo)', 'cash', 'variable', true),
    ('income',   'confirmed', v_bank, null, v_cat_salary,       950.00,  1, v_month,             'Sueldo (demo)', null, null, true),
    ('expense',  'confirmed', v_bank, null, v_cat_home,         350.00, -1, v_month,             'Arriendo (demo)', 'transfer', 'fixed', true),
    ('expense',  'confirmed', v_cash, null, v_cat_transport,     18.50, -1, v_month,             'Taxi (demo)', 'cash', 'variable', true),
    ('expense',  'confirmed', v_bank, null, v_cat_food,          67.80, -1, v_month,             'Supermercado (demo)', 'debit', 'variable', true),
    ('expense',  'pending',   v_bank, null, v_cat_fun,           25.00, -1, v_month + 20,        'Concierto (demo, pendiente)', 'debit', 'variable', true),
    ('transfer', 'confirmed', v_bank, v_cash, null,              60.00, -1, v_month,             'Retiro cajero (demo)', null, null, true);
end;
$$;

-- Borra únicamente los datos demo del usuario autenticado.
-- security definer porque no existe política DELETE para usuarios;
-- el filtro por auth.uid() es obligatorio en cada sentencia.
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
      join public.accounts a on a.id in (t.account_id, t.counter_account_id)
     where t.user_id = v_user and not t.is_demo and a.is_demo
  ) then
    raise exception 'Hay movimientos reales registrados en cuentas demo; anúlalos o muévelos antes de borrar la demo'
      using errcode = '23503';
  end if;

  delete from public.financial_transactions where user_id = v_user and is_demo;
  delete from public.accounts where user_id = v_user and is_demo;
end;
$$;

revoke execute on function public.load_demo_data() from public, anon;
revoke execute on function public.clear_demo_data() from public, anon;
grant execute on function public.load_demo_data() to authenticated;
grant execute on function public.clear_demo_data() to authenticated;
