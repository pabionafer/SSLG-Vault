import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { created, parseBody, serverError, badRequest, moneySchema } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { nextReceiptNo } from "@/lib/receipt-no";
import { recomputeCollectionTotal } from "@/lib/collections";

const rowSchema = z.object({
  student_id: z.coerce.number().int().positive(),
  fee_id: z.coerce.number().int().positive().nullish(),
  collection_id: z.coerce.number().int().positive().nullish(),
  amount: moneySchema(0.01),
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

    // Validate EVERY row before a single receipt number is reserved: the old
    // code burned the whole day's OR range first and then failed on a bad FK.
    const studentIds = [...new Set(body.data.payments.map((p) => p.student_id))];
    const feeIds = [...new Set(body.data.payments.map((p) => p.fee_id).filter((x): x is number => x != null))];
    const colIds = [...new Set(body.data.payments.map((p) => p.collection_id).filter((x): x is number => x != null))];

    const [{ data: students }, { data: fees }, { data: cols }] = await Promise.all([
      db.from("students").select("id").in("id", studentIds).is("deleted_at", null),
      db.from("fees").select("id,academic_year,semester,is_active,deleted_at").in("id", feeIds),
      db.from("collections").select("id,status,academic_year,deleted_at").in("id", colIds),
    ]);
    const studentSet = new Set((students ?? []).map((s) => s.id));
    const feeById = new Map((fees ?? []).map((f) => [f.id, f]));
    const colById = new Map((cols ?? []).map((c) => [c.id, c]));

    for (const p of body.data.payments) {
      if (!studentSet.has(p.student_id)) return badRequest(`Student ${p.student_id} not found or deleted`);
      if (p.fee_id != null) {
        const fee = feeById.get(p.fee_id);
        if (!fee || fee.deleted_at) return badRequest(`Fee ${p.fee_id} not found`);
        if (!fee.is_active) return badRequest(`Fee ${p.fee_id} is inactive`);
        if (p.academic_year !== fee.academic_year)
          return badRequest(`Row ${p.student_id}: academic year ${p.academic_year} does not match fee's ${fee.academic_year}`);
        if (p.semester && p.semester !== fee.semester)
          return badRequest(`Row ${p.student_id}: semester ${p.semester} does not match fee's ${fee.semester}`);
      }
      if (p.collection_id != null) {
        const col = colById.get(p.collection_id);
        if (!col || col.deleted_at) return badRequest(`Collection ${p.collection_id} not found`);
        if (col.status !== "active") return badRequest(`Collection ${p.collection_id} is closed`);
        if (p.academic_year !== col.academic_year)
          return badRequest(`Row ${p.student_id}: academic year ${p.academic_year} does not match batch's ${col.academic_year}`);
      }
    }

    const rows = [];
    const receipts: string[] = [];
    for (const p of body.data.payments) {
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
        semester: p.semester ?? (p.fee_id != null ? feeById.get(p.fee_id)?.semester ?? null : null),
        remarks: p.remarks ?? null,
        receipt_no: receiptNo,
        created_by: auth.profile.username,
      });
    }

    const { data, error } = await db.from("payments").insert(rows).select("id,receipt_no");
    if (error) return serverError(error);

    for (const colId of colIds) {
      await recomputeCollectionTotal(db, colId);
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
