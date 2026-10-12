"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { loanCreateSchema, loanPaymentSchema } from "@/lib/validation/schemas";
import { buildSchedule } from "@/lib/finance/schedule";
import type { ActionResult } from "@/lib/types";
import { dbError, requireUser, runAction, validationError } from "./_helpers";

function revalidateFinance() {
  revalidatePath("/", "layout");
}

/**
 * Alta de préstamo. Para préstamos con cuotas, el cronograma se calcula
 * sobre el SALDO PENDIENTE y las cuotas que faltan (sirve también para
 * préstamos que empezaron antes de usar la app).
 */
export async function createLoan(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const parsed = loanCreateSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const v = parsed.data;

    const schedule =
      v.loan_type === "amortized"
        ? buildSchedule({
            principal: v.outstanding,
            annualRatePct: v.annual_rate,
            installments: v.remaining_installments!,
            firstDueDate: v.first_due_date!,
            frequency: v.frequency,
          }).map(({ number, due_date, principal, interest }) => ({ number, due_date, principal, interest }))
        : [];

    const { data, error } = await supabase.rpc("create_loan", {
      p_lender: v.lender,
      p_name: v.name,
      p_loan_type: v.loan_type,
      p_original_principal: v.original_principal,
      p_outstanding: v.outstanding,
      p_annual_rate: v.annual_rate,
      p_frequency: v.frequency,
      p_start_date: v.start_date,
      p_first_due_date: v.loan_type === "amortized" ? v.first_due_date : null,
      p_account_id: v.account_id,
      p_notes: v.notes ?? "",
      p_disburse: v.disburse,
      p_schedule: schedule,
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, data: { id: data as string }, message: "Préstamo registrado" };
  });
}

/** Pago: capital (no es gasto) + intereses/cargos (sí es gasto), agrupados. */
export async function payLoan(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = loanPaymentSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const v = parsed.data;

    const { error } = await supabase.rpc("pay_loan", {
      p_loan_id: v.loan_id,
      p_installment_id: v.installment_id,
      p_account_id: v.account_id,
      p_date: v.occurred_on,
      p_principal: v.principal,
      p_interest: v.interest,
      p_notes: v.notes ?? "",
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Pago registrado" };
  });
}

export async function updateLoanInfo(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = z
      .object({
        id: z.uuid(),
        lender: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(60),
        notes: z.string().trim().max(500).nullish(),
      })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const { id, ...patch } = parsed.data;

    const { error } = await supabase.from("loans").update({ ...patch, notes: patch.notes || null }).eq("id", id);
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Préstamo actualizado" };
  });
}
