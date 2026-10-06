import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { created, parseBody, serverError, notFound } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { nextReceiptNo } from "@/lib/receipt-no";

const rowSchema = z.object({
  student_id: z.coerce.number().int().positive(),
  fee_id: z.coerce.number().int().positive().nullish(),
  collection_id: z.coerce.number().int().positive().nullish(),
  amount: z.coerce.number().positive(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["cash", "gcash", "bank_transfer", "other"]).optional(),
  reference_no: z.string().max(80).nullish(),
  academic_year: z.string().min(1),
  semester: z.enum(["1st Semester", "2nd Semester", "Summer"]).nullish(),
  remarks: z.string().max(500).nullish(),
});

const bulkSchema = z.object({
  payments: z.array(rowSchema).min(1).max(200),
});

// POST /api/payments/bulk — record a day's payments in one call (paymentRecorder)
export async function POST(req: NextRequest) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;

  const body = await parseBody(req, bulkSchema);
  if (body.error) return body.error;

  try {
    const db = createAdminClient();
    const rows = [];
    const receipts: string[] = [];

    for (const p of body.data.payments) {
      const { data: student } = await db
        .from("students")
        .select("id")
        .eq("id", p.student_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!student) return notFound(`Student ${p.student_id} not found`);

      const receiptNo = await nextReceiptNo();
      receipts.push(receiptNo);
      rows.push({
        student_id: p.student_id,
        fee_id: p.fee_id ?? null,
        collection_id: p.collection_id ?? null,
        amount: p.amount,
        payment_date: p.payment_date,
        // explicit keys: bulk inserts must not rely on column defaults
        // (PostgREST fills absent keys across the array with NULL)
        mode: p.mode ?? "cash",
        reference_no: p.reference_no ?? null,
        academic_year: p.academic_year,
        semester: p.semester ?? null,
        remarks: p.remarks ?? null,
        receipt_no: receiptNo,
        created_by: auth.profile.username,
      });
    }

    const { data, error } = await db.from("payments").insert(rows).select("id,receipt_no");
    if (error) return serverError(error);

    // bump collection totals in one pass
    const byCollection = new Map<string, number>();
    body.data.payments.forEach((p, i) => {
      if (!p.collection_id) return;
      byCollection.set(
        String(p.collection_id),
        (byCollection.get(String(p.collection_id)) ?? 0) + Number(body.data.payments[i].amount),
      );
    });
    for (const [colId, delta] of byCollection) {
      const { data: col } = await db
        .from("collections")
        .select("total_amount")
        .eq("id", colId)
        .maybeSingle();
      if (col) {
        await db
          .from("collections")
          .update({ total_amount: Number((Number(col.total_amount) + delta).toFixed(2)) })
          .eq("id", colId);
      }
    }

    await logAction(auth.profile.username, "create", "payments", null, {
      bulk: rows.length,
      receipts,
    });
    return created({ created: data?.length ?? 0, receipts });
  } catch (err) {
    return serverError(err);
  }
}
