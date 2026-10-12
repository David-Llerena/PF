-- =====================================================================
-- Pruebas Fase 2: tarjetas, diferidos, préstamos, recurrentes.
-- Se ejecutan después de financial_rules.test.sql (usa sus usuarios).
-- =====================================================================
\set ON_ERROR_STOP 1

insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000c', '{"full_name":"Usuario C"}');

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);

do $$
declare
  v_bank uuid; v_card uuid; v_food uuid; v_sub uuid; v_sal uuid;
  v_purchase uuid; v_prior uuid; v_loan uuid; v_simple uuid; v_group uuid; v_inst uuid; v_rule uuid; v_tx uuid;
  v_bal numeric; v_debt numeric; v_t record; v_l record; v_next date;
begin
  assert exists (select 1 from transaction_categories where name = 'Intereses y comisiones'), 'falta categoría intereses';

  v_bank := create_account('Banco', 'checking', null, 'USD', '#7c3aed', 'landmark', true, 2000, '2026-09-01');
  select id into v_food from transaction_categories where name = 'Alimentación';
  select id into v_sub from transaction_categories where name = 'Suscripciones';
  select id into v_sal from transaction_categories where name = 'Sueldo';

  -- ---------------- Tarjeta con deuda inicial ----------------
  v_card := create_credit_card('Visa Oro', null, 'visa', 3000, 20, 5, '4242', '#4f46e5', 150, '2026-09-01');
  select debt into v_debt from card_balances where credit_card_id = v_card;
  assert v_debt = 150, 'deuda inicial: ' || v_debt;
  -- La deuda inicial no es gasto del período
  select * into v_t from period_totals('2026-09-01', '2026-09-30');
  assert v_t.expense = '0.00', 'deuda inicial contó como gasto';

  -- ---------------- Consumo corriente con tarjeta ----------------
  insert into financial_transactions (kind, credit_card_id, category_id, amount, direction, occurred_on, description, payment_method, expense_type)
  values ('expense', v_card, v_food, 80.25, -1, '2026-10-02', 'Supermercado', 'card', 'variable');
  select debt into v_debt from card_balances where credit_card_id = v_card;
  assert v_debt = 230.25, 'deuda tras consumo: ' || v_debt;
  select balance into v_bal from account_balances where account_id = v_bank;
  assert v_bal = 2000, 'consumo con tarjeta tocó el banco';
  select * into v_t from period_totals('2026-10-01', '2026-10-31');
  assert v_t.expense = '80.25', 'consumo con tarjeta no es gasto';

  -- Un gasto con tarjeta debe declarar medio "card"; uno bancario no puede usar "card"
  begin
    insert into financial_transactions (kind, credit_card_id, category_id, amount, direction, occurred_on, description, payment_method)
    values ('expense', v_card, v_food, 1, -1, '2026-10-02', 'x', 'cash');
    raise exception 'gasto con tarjeta y medio cash aceptado';
  exception when check_violation then null; end;
  begin
    insert into financial_transactions (kind, account_id, credit_card_id, category_id, amount, direction, occurred_on, description, payment_method)
    values ('expense', v_bank, v_card, v_food, 1, -1, '2026-10-02', 'x', 'card');
    raise exception 'gasto con cuenta y tarjeta a la vez aceptado';
  exception when check_violation then null; end;

  -- ---------------- Diferido $600 a 6 meses sin intereses ----------------
  v_purchase := create_card_purchase(v_card, v_food, 'Refrigeradora', 'Almacén', '2026-10-03', 600, 0, false, null,
    '[{"number":1,"due_date":"2026-11-05","principal":"100.00","interest":"0.00"},
      {"number":2,"due_date":"2026-12-05","principal":"100.00","interest":"0.00"},
      {"number":3,"due_date":"2027-01-05","principal":"100.00","interest":"0.00"},
      {"number":4,"due_date":"2027-02-05","principal":"100.00","interest":"0.00"},
      {"number":5,"due_date":"2027-03-05","principal":"100.00","interest":"0.00"},
      {"number":6,"due_date":"2027-04-05","principal":"100.00","interest":"0.00"}]'::jsonb);
  assert (select count(*) from installment_schedules where purchase_id = v_purchase) = 6, 'cuotas generadas';
  assert (select sum(amount) from installment_schedules where purchase_id = v_purchase) = 600, 'suma cuotas';
  select debt into v_debt from card_balances where credit_card_id = v_card;
  assert v_debt = 830.25, 'deuda tras diferido: ' || v_debt;
  select * into v_t from period_totals('2026-10-01', '2026-10-31');
  assert v_t.expense = '680.25', 'diferido debe ser gasto una sola vez: ' || v_t.expense;
  -- Meses siguientes: las cuotas NO generan gasto
  select * into v_t from period_totals('2026-11-01', '2027-04-30');
  assert v_t.expense = '0.00', 'cuotas duplicaron el gasto';

  -- Cronograma que no cuadra → rechazado
  begin
    perform create_card_purchase(v_card, v_food, 'Mal', null, '2026-10-03', 100, 0, false, null,
      '[{"number":1,"due_date":"2026-11-05","principal":"60.00","interest":"0.00"}]'::jsonb);
    raise exception 'cronograma descuadrado aceptado';
  exception when invalid_parameter_value then null; end;

  -- ---------------- Diferido con intereses ----------------
  v_tx := create_card_purchase(v_card, v_food, 'Laptop', null, '2026-10-04', 300, 15, false, null,
    '[{"number":1,"due_date":"2026-11-05","principal":"98.75","interest":"3.75"},
      {"number":2,"due_date":"2026-12-05","principal":"100.00","interest":"2.52"},
      {"number":3,"due_date":"2027-01-05","principal":"101.25","interest":"1.27"}]'::jsonb);
  select * into v_t from period_totals('2026-10-01', '2026-10-31');
  assert v_t.expense = '987.79', 'gasto + intereses: ' || v_t.expense;
  assert (select total_interest from credit_card_purchases where id = v_tx) = 7.54, 'interés total';

  -- ---------------- Diferido previo a la app: deuda, no gasto ----------------
  v_prior := create_card_purchase(v_card, null, 'TV (antes de la app)', null, '2026-08-15', 200, 0, true, null,
    '[{"number":1,"due_date":"2026-11-05","principal":"100.00","interest":"0.00"},
      {"number":2,"due_date":"2026-12-05","principal":"100.00","interest":"0.00"}]'::jsonb);
  select * into v_t from period_totals('2026-08-01', '2026-08-31');
  assert v_t.expense = '0.00', 'diferido previo contó como gasto';
  select debt into v_debt from card_balances where credit_card_id = v_card;
  assert v_debt = 1337.79, 'deuda con diferido previo: ' || v_debt;

  -- ---------------- Pago de tarjeta: baja banco y deuda, NO es gasto (regla 1) ----------------
  insert into financial_transactions (kind, account_id, credit_card_id, amount, direction, occurred_on, description, payment_kind)
  values ('card_payment', v_bank, v_card, 337.79, -1, '2026-11-05', 'Pago Visa', 'period');
  select debt into v_debt from card_balances where credit_card_id = v_card;
  assert v_debt = 1000.00, 'deuda tras pago: ' || v_debt;
  select balance into v_bal from account_balances where account_id = v_bank;
  assert v_bal = 1662.21, 'banco tras pago: ' || v_bal;
  select * into v_t from period_totals('2026-11-01', '2026-11-30');
  assert v_t.expense = '0.00', 'pago de tarjeta contó como gasto';

  -- ---------------- Anular el diferido completo ----------------
  select id into v_tx from financial_transactions where card_purchase_id = v_purchase limit 1;
  perform void_transaction(v_tx);
  assert (select status from credit_card_purchases where id = v_purchase) = 'void', 'compra no anulada';
  select debt into v_debt from card_balances where credit_card_id = v_card;
  assert v_debt = 400.00, 'deuda tras anular diferido: ' || v_debt;
  -- Editar el monto de un movimiento de compra diferida está prohibido
  select id into v_tx from financial_transactions where card_purchase_id = v_prior limit 1;
  begin
    update financial_transactions set amount = 1 where id = v_tx;
    raise exception 'edición de diferido aceptada';
  exception when invalid_parameter_value then null; end;

  -- ---------------- Préstamo amortizado recibido en cuenta ----------------
  v_loan := create_loan('Banco X', 'Préstamo auto', 'amortized', 1000, 1000, 12, 'monthly', '2026-10-01', '2026-11-01',
    v_bank, null, true,
    '[{"number":1,"due_date":"2026-11-01","principal":"490.05","interest":"10.00"},
      {"number":2,"due_date":"2026-12-01","principal":"509.95","interest":"5.10"}]'::jsonb);
  select balance into v_bal from account_balances where account_id = v_bank;
  assert v_bal = 2662.21, 'desembolso no subió el banco: ' || v_bal;
  select * into v_t from period_totals('2026-10-01', '2026-10-31');
  assert v_t.income = '0.00', 'préstamo recibido contó como ingreso (regla 3)';
  select * into v_l from loan_balances where loan_id = v_loan;
  assert v_l.outstanding = 1000, 'saldo préstamo';

  -- Pagar cuota 1: capital no es gasto, interés sí (regla 4)
  select id into v_inst from loan_installments where loan_id = v_loan and number = 1;
  v_group := pay_loan(v_loan, v_inst, v_bank, '2026-11-01', 490.05, 10.00, null);
  select * into v_l from loan_balances where loan_id = v_loan;
  assert v_l.outstanding = 509.95 and v_l.principal_paid = 490.05 and v_l.interest_paid = 10, 'saldos préstamo tras pago';
  select * into v_t from period_totals('2026-11-01', '2026-11-30');
  assert v_t.expense = '10.00', 'solo el interés es gasto: ' || v_t.expense;
  assert (select status from loan_installments where id = v_inst) = 'paid', 'cuota no marcada';
  begin
    perform pay_loan(v_loan, v_inst, v_bank, '2026-11-02', 1, 0, null);
    raise exception 'doble pago de cuota aceptado';
  exception when invalid_parameter_value then null; end;

  -- Anular el pago: se anula el grupo y la cuota vuelve a pendiente
  select id into v_tx from financial_transactions where payment_group_id = v_group and kind = 'loan_payment';
  assert void_transaction(v_tx) = 2, 'grupo no anulado completo';
  assert (select status from loan_installments where id = v_inst) = 'pending', 'cuota no reabierta';
  select * into v_l from loan_balances where loan_id = v_loan;
  assert v_l.outstanding = 1000, 'saldo no restaurado';

  -- Abono mayor al saldo → rechazado
  begin
    perform pay_loan(v_loan, null, v_bank, '2026-11-02', 5000, 0, null);
    raise exception 'abono excesivo aceptado';
  exception when invalid_parameter_value then null; end;

  -- ---------------- Deuda simple: se liquida y cambia a pagada ----------------
  v_simple := create_loan('Primo', 'Deuda primo', 'simple', null, 120, 0, null, '2026-10-01', null, null, null, false, '[]'::jsonb);
  perform pay_loan(v_simple, null, v_bank, '2026-10-10', 120, 0, null);
  assert (select status from loans where id = v_simple) = 'paid', 'deuda simple no liquidada';

  -- ---------------- Recurrentes ----------------
  assert next_occurrence('2026-01-31', 'monthly', 31) = '2026-02-28', 'mensual fin de mes';
  assert next_occurrence('2026-02-28', 'monthly', 31) = '2026-03-31', 'mensual recupera ancla';
  assert next_occurrence('2026-10-05', 'semimonthly', 5) = '2026-10-20', 'quincenal 1';
  assert next_occurrence('2026-10-20', 'semimonthly', 5) = '2026-11-05', 'quincenal 2';
  assert next_occurrence('2026-10-15', 'semimonthly', 15) = '2026-10-30', 'quincenal 15→30';
  assert next_occurrence('2026-02-15', 'semimonthly', 15) = '2026-02-28', 'quincenal febrero';
  assert next_occurrence('2028-02-29', 'yearly', 29) = '2029-02-28', 'anual bisiesto';

  insert into recurring_rules (kind, name, amount, category_id, frequency, next_date, anchor_day, credit_card_id, is_subscription)
  values ('expense', 'Netflix', 10.99, v_sub, 'monthly', '2026-10-15', 15, v_card, true)
  returning id into v_rule;

  -- La regla no crea gastos ni deuda por sí sola
  select debt into v_debt from card_balances where credit_card_id = v_card;
  assert v_debt = 400.00, 'regla alteró la deuda';

  v_tx := register_recurring(v_rule, '2026-10-15', 10.99, null, v_card, 'confirmed');
  select debt into v_debt from card_balances where credit_card_id = v_card;
  assert v_debt = 410.99, 'suscripción con tarjeta no sumó a la deuda';
  assert (select next_date from recurring_rules where id = v_rule) = '2026-11-15', 'no avanzó la fecha';
  v_next := skip_recurring(v_rule);
  assert v_next = '2026-12-15', 'omitir no avanzó';

  begin
    insert into recurring_rules (kind, name, amount, category_id, frequency, next_date, anchor_day, credit_card_id)
    values ('income', 'Sueldo a tarjeta', 100, v_sal, 'monthly', '2026-10-30', 30, v_card);
    raise exception 'ingreso a tarjeta aceptado';
  exception when check_violation then null; end;
end $$;

-- ---------------- Aislamiento: el usuario A no ve ni usa datos de C ----------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
do $$
declare
  v_c_card uuid; v_c_loan uuid; v_a_bank uuid;
begin
  assert (select count(*) from credit_cards) = 0, 'A ve tarjetas de C';
  assert (select count(*) from loans) = 0, 'A ve préstamos de C';
  assert (select count(*) from card_balances) = 0, 'A ve deudas de C';
  assert (select count(*) from installment_schedules) = 0, 'A ve cuotas de C';
  assert (select count(*) from recurring_rules) = 0, 'A ve recurrentes de C';

  reset role;
  select id into v_c_card from credit_cards limit 1;
  select id into v_c_loan from loans where name = 'Préstamo auto';
  set role authenticated;
  select id into v_a_bank from accounts limit 1;

  begin
    insert into financial_transactions (kind, account_id, credit_card_id, amount, direction, occurred_on, description)
    values ('card_payment', v_a_bank, v_c_card, 1, -1, '2026-10-05', 'pago a tarjeta ajena');
    raise exception 'A pagó la tarjeta de C';
  exception when insufficient_privilege then null; end;

  begin
    perform pay_loan(v_c_loan, null, v_a_bank, '2026-10-05', 1, 0, null);
    raise exception 'A pagó el préstamo de C';
  exception when insufficient_privilege then null; end;

  begin
    insert into loan_installments (user_id, loan_id, number, due_date, principal, interest, amount)
    values (auth.uid(), v_c_loan, 99, '2026-12-01', 1, 0, 1);
    raise exception 'A insertó cuota en préstamo de C';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
select 'OK: pruebas Fase 2 pasaron' as resultado;

-- ---------------- Demo completa: carga y borrado limpio ----------------
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000e');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000e', false);
do $$
begin
  perform load_demo_data_all();
  assert (select count(*) from credit_cards where is_demo) = 1, 'demo tarjeta';
  assert (select count(*) from loans where is_demo) = 1, 'demo préstamo';
  assert (select count(*) from installment_schedules) = 6, 'demo cuotas';
  assert (select count(*) from loan_installments) = 6, 'demo cuotas préstamo';
  assert (select debt from card_balances limit 1) = 765.60, 'demo deuda tarjeta';
  assert not exists (select 1 from financial_transactions where not is_demo), 'movimientos demo sin marcar';
  perform clear_demo_data();
  assert (select count(*) from credit_cards) = 0 and (select count(*) from loans) = 0
     and (select count(*) from accounts) = 0 and (select count(*) from financial_transactions) = 0
     and (select count(*) from recurring_rules) = 0, 'demo no borrada completa';
end $$;
reset role;
select 'OK: demo Fase 2' as resultado;
