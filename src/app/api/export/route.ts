import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { KIND_LABEL, STATUS_LABEL } from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import type { Transaction } from "@/lib/types";
import { TX_SELECT } from "@/services/finance";

export const dynamic = "force-dynamic";

/** Neutraliza fórmulas (inyección CSV) y escapa comillas. */
function cell(value: string | null | undefined): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

/** Respaldo de movimientos del usuario autenticado en CSV (UTF-8 con BOM para Excel). */
export async function GET() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const rows: Transaction[] = [];
  const pageSize = 1000;
  for (let from = 0; from < 50_000; from += pageSize) {
    const { data, error } = await supabase
      .from("financial_transactions")
      .select(TX_SELECT)
      .order("occurred_on")
      .order("created_at")
      .range(from, from + pageSize - 1);
    if (error) return NextResponse.json({ error: "No se pudo exportar" }, { status: 500 });
    rows.push(...((data ?? []) as unknown as Transaction[]));
    if (!data || data.length < pageSize) break;
  }

  const header = ["fecha", "tipo", "estado", "concepto", "categoria", "cuenta", "cuenta_destino", "tarjeta", "importe", "sentido", "medio_pago", "notas", "motivo_ajuste", "demo"];
  const lines = rows.map((t) =>
    [
      t.occurred_on,
      KIND_LABEL[t.kind],
      STATUS_LABEL[t.status],
      t.description,
      t.category?.name,
      t.account?.name,
      t.counter_account?.name,
      t.credit_card?.name,
      t.amount,
      t.direction === 1 ? "entrada" : "salida",
      t.payment_method,
      t.notes,
      t.reason,
      t.is_demo ? "sí" : "no",
    ]
      .map((v) => cell(v == null ? "" : String(v)))
      .join(","),
  );
  const csv = "﻿" + [header.join(","), ...lines].join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimientos-${todayISO()}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
