-- =====================================================================
-- Pruebas de reglas financieras y aislamiento RLS a nivel de base de datos.
-- Ejecutar sobre una BD con el stub (_supabase_stub.sql) + migraciones:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/financial_rules.test.sql
-- Cada aserción lanza excepción si falla.
-- =====================================================================
\set ON_ERROR_STOP 1

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', '{"full_name":"Usuario A"}'),
  ('00000000-0000-0000-0000-00000000000b', '{"full_name":"Usuario B"}');

-- ---------- Usuario A ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

do $$
declare
  v_bank uuid; v_cash uuid; v_food uuid; v_sal uuid; v_bal numeric; v_t record; v_tx uuid;
begin
  -- Perfil y categorías creados por el trigger de alta
  assert (select count(*) from profiles) = 1, 'perfil no creado';
  assert (select count(*) from transaction_categories) = 20, 'categorías iniciales incorrectas';

  v_bank := create_account('Ahorros', 'savings', null, 'USD', '#7c3aed', 'landmark', true, 1000.10, '2026-09-01');
  v_cash := create_account('Efectivo', 'cash', null, 'USD', '#16a34a', 'wallet', false, 0, '2026-09-01');
  select id into v_food from transaction_categories where name = 'Alimentación';
  select id into v_sal from transaction_categories where name = 'Sueldo';

  -- Regla 7: saldo inicial definido como movimiento opening
  select balance into v_bal from account_balances where account_id = v_bank;
  assert v_bal = 1000.10, 'saldo inicial incorrecto: ' || v_bal;
  select balance into v_bal from account_balances where account_id = v_cash;
  assert v_bal = 0, 'cuenta sin saldo inicial debe ser 0';

  -- Ingreso y gasto confirmados
  insert into financial_transactions (kind, account_id, category_id, amount, direction, occurred_on, description)
  values ('income', v_bank, v_sal, 900.00, 1, '2026-10-01', 'Sueldo');
  insert into financial_transactions (kind, account_id, category_id, amount, direction, occurred_on, description, payment_method, expense_type)
  values ('expense', v_bank, v_food, 0.10, -1, '2026-10-02', 'Chicle', 'debit', 'variable'),
         ('expense', v_bank, v_food, 0.20, -1, '2026-10-02', 'Chicle 2', 'debit', 'variable');

  -- Regla 10: precisión decimal (0.1 + 0.2 = 0.3 exacto)
  select * into v_t from period_totals('2026-10-01', '2026-10-31');
  assert v_t.expense = '0.30', 'precisión decimal: ' || v_t.expense;
  assert v_t.income = '900.00', 'ingresos del mes: ' || v_t.income;

  -- Regla 2: transferencia no es ingreso ni gasto, y conserva el total
  insert into financial_transactions (kind, account_id, counter_account_id, amount, direction, occurred_on, description)
  values ('transfer', v_bank, v_cash, 100.00, -1, '2026-10-03', 'Retiro');
  select * into v_t from period_totals('2026-10-01', '2026-10-31');
  assert v_t.income = '900.00' and v_t.expense = '0.30', 'transferencia alteró ingresos/gastos';
  select balance into v_bal from account_balances where account_id = v_cash;
  assert v_bal = 100.00, 'destino de transferencia: ' || v_bal;
  select sum(balance) into v_bal from account_balances;
  assert v_bal = 1899.80, 'total tras transferencia: ' || v_bal;

  -- Regla 8: movimiento pendiente no altera saldo
  insert into financial_transactions (kind, status, account_id, category_id, amount, direction, occurred_on, description, payment_method, expense_type)
  values ('expense', 'pending', v_bank, v_food, 50.00, -1, '2026-10-20', 'Pendiente', 'debit', 'fixed')
  returning id into v_tx;
  select sum(balance) into v_bal from account_balances;
  assert v_bal = 1899.80, 'pendiente alteró saldo';
  select * into v_t from period_totals('2026-10-01', '2026-10-31');
  assert v_t.pending_expense = '50.00', 'gasto pendiente no reportado';

  -- Confirmarlo sí lo altera
  update financial_transactions set status = 'confirmed' where id = v_tx;
  select sum(balance) into v_bal from account_balances;
  assert v_bal = 1849.80, 'confirmación no aplicada: ' || v_bal;

  -- Regla 12: anular revierte el saldo
  update financial_transactions set status = 'void' where id = v_tx;
  select sum(balance) into v_bal from account_balances;
  assert v_bal = 1899.80, 'anulación no revertida: ' || v_bal;

  -- Regla 9: ajuste exige motivo y queda auditado
  begin
    insert into financial_transactions (kind, account_id, amount, direction, occurred_on, description)
    values ('adjustment', v_cash, 5, -1, '2026-10-04', 'Ajuste');
    raise exception 'ajuste sin motivo fue aceptado';
  exception when check_violation then null;
  end;
  insert into financial_transactions (kind, account_id, amount, direction, occurred_on, description, reason)
  values ('adjustment', v_cash, 5, -1, '2026-10-04', 'Ajuste', 'Cuadre con conteo físico');
  select balance into v_bal from account_balances where account_id = v_cash;
  assert v_bal = 95.00, 'ajuste: ' || v_bal;
  select * into v_t from period_totals('2026-10-01', '2026-10-31');
  assert v_t.expense = '0.30', 'ajuste contó como gasto';
  assert (select count(*) from audit_log where table_name = 'financial_transactions') >= 7, 'auditoría incompleta';

  -- Cambio de saldo inicial: anula el anterior y crea uno nuevo
  perform set_opening_balance(v_bank, 1500, '2026-09-01');
  select balance into v_bal from account_balances where account_id = v_bank;
  assert v_bal = 2299.70, 'nuevo saldo inicial: ' || v_bal;

  -- Restricciones de integridad
  begin
    insert into financial_transactions (kind, account_id, counter_account_id, amount, direction, occurred_on, description)
    values ('transfer', v_bank, v_bank, 1, -1, '2026-10-05', 'Misma cuenta');
    raise exception 'transferencia a la misma cuenta aceptada';
  exception when check_violation then null;
  end;
  begin
    insert into financial_transactions (kind, account_id, category_id, amount, direction, occurred_on, description)
    values ('income', v_bank, v_food, 1, 1, '2026-10-05', 'Categoría de gasto en ingreso');
    raise exception 'categoría de tipo incorrecto aceptada';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into financial_transactions (kind, account_id, category_id, amount, direction, occurred_on, description, payment_method, expense_type)
    values ('expense', v_bank, v_food, -5, -1, '2026-10-05', 'Negativo', 'cash', 'fixed');
    raise exception 'importe negativo aceptado';
  exception when check_violation then null;
  end;

  -- Cuenta predeterminada única
  perform set_default_account(v_cash);
  assert (select count(*) from accounts where is_default) = 1, 'más de una cuenta predeterminada';

  -- Serie mensual
  assert (select count(*) from monthly_cashflow('2026-10-12', 6)) = 6, 'serie mensual';
  assert (select expense from monthly_cashflow('2026-10-12', 6) where month = '2026-10-01') = '0.30', 'serie octubre';
end $$;

-- ---------- Usuario B: aislamiento RLS ----------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);

do $$
declare
  v_a_account uuid;
  v_b_account uuid;
  v_food uuid;
begin
  assert (select count(*) from accounts) = 0, 'B ve cuentas de A';
  assert (select count(*) from financial_transactions) = 0, 'B ve movimientos de A';
  assert (select count(*) from audit_log) = 0 or not exists (select 1 from audit_log where user_id <> auth.uid()), 'B ve auditoría de A';
  assert (select count(*) from account_balances) = 0, 'B ve saldos de A';
  assert (select income from period_totals('2026-01-01', '2026-12-31')) = '0.00', 'B suma datos de A';

  -- Intentar referenciar la cuenta de A conociendo su id
  reset role;
  select id into v_a_account from accounts where name = 'Ahorros';
  set role authenticated;

  v_b_account := create_account('Mi cuenta', 'checking', null, 'USD', '#7c3aed', 'landmark', false, 10, '2026-10-01');
  select id into v_food from transaction_categories where name = 'Alimentación';

  begin
    insert into financial_transactions (kind, account_id, counter_account_id, amount, direction, occurred_on, description)
    values ('transfer', v_b_account, v_a_account, 1, -1, '2026-10-05', 'Robo');
    raise exception 'B pudo transferir a la cuenta de A';
  exception when insufficient_privilege then null;
  end;

  update accounts set name = 'hackeada' where id = v_a_account;
  reset role;
  assert (select name from accounts where id = v_a_account) = 'Ahorros', 'B modificó cuenta de A';
  set role authenticated;

  -- Demo: carga y borrado sin afectar datos reales
  perform load_demo_data();
  assert (select count(*) from accounts where is_demo) = 2, 'demo no cargada';
  perform clear_demo_data();
  assert (select count(*) from accounts where is_demo) = 0, 'demo no borrada';
  assert (select count(*) from accounts) = 1, 'borrar demo afectó datos reales';
end $$;

reset role;
select 'OK: todas las pruebas SQL pasaron' as resultado;
