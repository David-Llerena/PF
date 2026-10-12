-- =====================================================================
-- Pruebas Fase 3: presupuestos, metas de ahorro y reportes.
-- =====================================================================
\set ON_ERROR_STOP 1

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', false);

do $$
declare
  v_bank uuid; v_card uuid; v_food uuid; v_fun uuid; v_sal uuid; v_goal uuid; v_goal2 uuid; v_r record; v_n int;
begin
  v_bank := create_account('Banco', 'savings', null, 'USD', '#7c3aed', 'landmark', true, 1000, '2026-08-01');
  v_card := create_credit_card('Visa', null, 'visa', 2000, 20, 5, null, '#1e1b4b', 0, '2026-08-01');
  select id into v_food from transaction_categories where name = 'Alimentación';
  select id into v_fun from transaction_categories where name = 'Entretenimiento';
  select id into v_sal from transaction_categories where name = 'Sueldo';

  insert into financial_transactions (kind, account_id, category_id, amount, direction, occurred_on, description, payment_method, expense_type)
  values ('expense', v_bank, v_food, 90.10, -1, '2026-10-02', 'Súper', 'debit', 'variable'),
         ('expense', v_bank, v_food, 50.00, -1, '2026-09-10', 'Súper septiembre', 'debit', 'variable');
  insert into financial_transactions (kind, credit_card_id, category_id, amount, direction, occurred_on, description, payment_method, expense_type)
  values ('expense', v_card, v_food, 40.00, -1, '2026-10-05', 'Restaurante', 'card', 'variable');
  insert into financial_transactions (kind, status, account_id, category_id, amount, direction, occurred_on, description, payment_method, expense_type)
  values ('expense', 'pending', v_bank, v_food, 500, -1, '2026-10-20', 'Pendiente no cuenta', 'debit', 'variable');
  insert into financial_transactions (kind, account_id, category_id, amount, direction, occurred_on, description)
  values ('income', v_bank, v_sal, 800, 1, '2026-10-01', 'Sueldo');

  -- ---------- Presupuestos ----------
  insert into budgets (category_id, period_month, amount) values (v_food, '2026-10-01', 150), (v_fun, '2026-10-01', 50);
  select * into v_r from budget_status('2026-10-15') where category_id = v_food;
  assert v_r.spent = '130.10', 'consumido del presupuesto (cuenta + tarjeta, sin pendientes): ' || v_r.spent;
  assert v_r.amount = '150.00', 'monto presupuesto';
  begin
    insert into budgets (category_id, period_month, amount) values (v_sal, '2026-10-01', 10);
    raise exception 'presupuesto sobre categoría de ingreso aceptado';
  exception when invalid_parameter_value then null; end;
  begin
    insert into budgets (category_id, period_month, amount) values (v_food, '2026-10-15', 10);
    raise exception 'presupuesto con fecha que no es inicio de mes aceptado';
  exception when check_violation then null; end;
  v_n := copy_budgets('2026-10-01', '2026-11-01');
  assert v_n = 2, 'copiar presupuestos';
  assert copy_budgets('2026-10-01', '2026-11-01') = 0, 'copiar dos veces duplicó';

  -- ---------- Metas: reservas sin doble conteo ----------
  insert into savings_goals (name, target_amount) values ('Viaje', 1000) returning id into v_goal;
  insert into savings_goals (name, target_amount) values ('Emergencia', 5000) returning id into v_goal2;
  perform allocate_to_goal(v_goal, 600, '2026-10-10', null);
  -- La reserva no cambia saldos
  assert (select sum(balance) from account_balances) = 1659.90, 'reserva alteró saldos';
  begin
    perform allocate_to_goal(v_goal2, 1100, '2026-10-10', null);
    raise exception 'reservó más que el disponible';
  exception when invalid_parameter_value then null; end;
  perform allocate_to_goal(v_goal2, 1059.90, '2026-10-10', null);
  assert (select sum(allocated) from goal_balances) = 1659.90, 'total reservado';
  begin
    perform allocate_to_goal(v_goal, -700, '2026-10-11', null);
    raise exception 'liberó más de lo reservado';
  exception when invalid_parameter_value then null; end;
  perform allocate_to_goal(v_goal, -100, '2026-10-11', 'retiro');
  assert (select allocated from goal_balances where goal_id = v_goal) = 500, 'liberación parcial';
  begin
    insert into savings_goal_movements (user_id, goal_id, amount, occurred_on) values (auth.uid(), v_goal, 99999, '2026-10-11');
    raise exception 'insert directo de reserva permitido';
  exception when insufficient_privilege then null; end;
  perform archive_goal(v_goal);
  assert (select allocated from goal_balances where goal_id = v_goal) = 0, 'archivar no liberó';

  -- ---------- Reportes ----------
  assert (select count(*) from report_cashflow('2026-08-01', '2026-10-31')) = 3, 'meses del reporte';
  select * into v_r from report_cashflow('2026-10-01', '2026-10-31') limit 1;
  assert v_r.income = '800.00' and v_r.expense = '130.10', 'cashflow octubre: ' || v_r.expense;
  select * into v_r from report_cashflow('2026-10-01', '2026-10-31', v_card) limit 1;
  assert v_r.expense = '40.00', 'filtro por tarjeta';
  select * into v_r from report_cashflow('2026-09-01', '2026-10-31', null, v_food) where month = '2026-09-01';
  assert v_r.expense = '50.00', 'filtro por categoría';
  assert (select total from report_categories('2026-10-01', '2026-10-31') limit 1) = '130.10', 'categorías';

  select * into v_r from report_position('2026-09-01', '2026-10-31') where month_end = '2026-09-30';
  assert v_r.assets = '950.00', 'activos a fin de septiembre: ' || v_r.assets;
  select * into v_r from report_position('2026-09-01', '2026-10-31') where month_end = '2026-10-31';
  assert v_r.assets = '1659.90' and v_r.card_debt = '40.00', 'posición octubre';

  select * into v_r from avg_variable_spending(3);
  assert v_r.months_with_data >= 1, 'meses con datos';
end $$;

-- Aislamiento
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', false);
do $$
declare v_goal uuid;
begin
  assert (select count(*) from budgets) = 0 and (select count(*) from savings_goals) = 0, 'F2 ve datos de F1';
  assert (select count(*) from budget_status('2026-10-01')) = 0, 'budget_status filtra';
  assert (select expense from report_cashflow('2026-10-01', '2026-10-31') limit 1) = '0.00', 'reporte filtra';
  reset role;
  select id into v_goal from savings_goals where name = 'Emergencia';
  set role authenticated;
  begin
    perform allocate_to_goal(v_goal, 1, '2026-10-10', null);
    raise exception 'F2 reservó en meta de F1';
  exception when insufficient_privilege then null; end;
  -- Demo completa con metas y presupuestos, y borrado limpio
  perform load_demo_data_all();
  assert (select count(*) from savings_goals where is_demo) = 1, 'demo meta';
  assert (select count(*) from budgets where is_demo) = 3, 'demo presupuestos';
  perform clear_demo_data();
  assert (select count(*) from savings_goals) = 0 and (select count(*) from budgets) = 0, 'demo fase 3 no borrada';
end $$;

reset role;
select 'OK: pruebas Fase 3 pasaron' as resultado;
