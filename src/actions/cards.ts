"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  cardCreateSchema,
  cardOpeningSchema,
  cardPaymentSchema,
  cardPurchaseSchema,
  cardUpdateSchema,
} from "@/lib/validation/schemas";
import { buildSchedule } from "@/lib/finance/schedule";
import type { ActionResult } from "@/lib/types";
import { dbError, requireUser, runAction, validationError } from "./_helpers";
import { resolveInstitution } from "./_institutions";

function revalidateFinance() {
  revalidatePath("/", "layout");
}

export async function createCard(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const parsed = cardCreateSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase, user } = await requireUser();
    const v = parsed.data;

    const inst = await resolveInstitution(supabase, user.id, v.institution_id, v.new_institution);
    if ("error" in inst) return inst.error;

    const { data, error } = await supabase.rpc("create_credit_card", {
      p_name: v.name,
      p_institution_id: inst.id,
      p_network: v.network,
      p_credit_limit: v.credit_limit,
      p_statement_day: v.statement_day,
      p_due_day: v.due_day,
      p_last4: v.last4 ?? "",
      p_color: v.color,
      p_opening_debt: v.opening_debt,
      p_opening_date: v.opening_date,
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, data: { id: data as string }, message: "Tarjeta creada" };
  });
}

export async function updateCard(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = cardUpdateSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase, user } = await requireUser();
    const v = parsed.data;

    const inst = await resolveInstitution(supabase, user.id, v.institution_id, v.new_institution);
    if ("error" in inst) return inst.error;

    const { error } = await supabase
      .from("credit_cards")
      .update({
        name: v.name,
        institution_id: inst.id,
        network: v.network,
        credit_limit: v.credit_limit,
        statement_day: v.statement_day,
        due_day: v.due_day,
        last4: v.last4,
        color: v.color,
      })
      .eq("id", v.id);
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Tarjeta actualizada" };
  });
}

export async function setCardOpeningDebt(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = cardOpeningSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();

    const { error } = await supabase.rpc("set_card_opening_debt", {
      p_card_id: parsed.data.credit_card_id,
      p_amount: parsed.data.opening_debt,
      p_date: parsed.data.opening_date,
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Deuda inicial actualizada" };
  });
}

export async function setCardActive(input: unknown, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = z.object({ id: z.uuid() }).safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();

    const { error } = await supabase.from("credit_cards").update({ is_active: active }).eq("id", parsed.data.id);
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: active ? "Tarjeta reactivada" : "Tarjeta desactivada" };
  });
}

/**
 * Compra diferida (o diferido previo a la app). El cronograma se calcula en
 * el servidor; la base de datos valida que el capital cuadre.
 */
export async function createCardPurchase(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const parsed = cardPurchaseSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const v = parsed.data;

    const schedule = buildSchedule({
      principal: v.amount,
      annualRatePct: v.annual_rate,
      installments: v.installments,
      firstDueDate: v.first_due_date,
      frequency: "monthly",
    });

    const { data, error } = await supabase.rpc("create_card_purchase", {
      p_card_id: v.credit_card_id,
      p_category_id: v.is_prior ? null : v.category_id,
      p_description: v.description,
      p_merchant: v.merchant ?? "",
      p_purchase_date: v.purchase_date,
      p_principal: v.amount,
      p_annual_rate: v.annual_rate,
      p_is_prior: v.is_prior,
      p_notes: v.notes ?? "",
      p_schedule: schedule.map(({ number, due_date, principal, interest }) => ({ number, due_date, principal, interest })),
    });
    if (error) return dbError(error);

    revalidateFinance();
    return {
      ok: true,
      data: { id: data as string },
      message: v.is_prior
        ? "Diferido previo registrado como deuda"
        : `Compra diferida a ${v.installments} cuotas registrada`,
    };
  });
}

/** Pago de tarjeta: baja la cuenta y la deuda. No es gasto (el consumo ya se registró). */
export async function payCard(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = cardPaymentSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const v = parsed.data;

    const { error } = await supabase.from("financial_transactions").insert({
      kind: "card_payment",
      status: "confirmed",
      direction: -1,
      account_id: v.account_id,
      credit_card_id: v.credit_card_id,
      amount: v.amount,
      occurred_on: v.occurred_on,
      description: "Pago de tarjeta",
      payment_kind: v.payment_kind,
      notes: v.notes,
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Pago de tarjeta registrado" };
  });
}
