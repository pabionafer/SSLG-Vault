import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import {
  created,
  listResponse,
  paging,
  parseBody,
  serverError,
  notFound,
  conflict,
  badRequest,
  moneySchema,
} from "@/lib/api";
import { logAction } from "@/lib/audit";
import { nextReceiptNo } from "@/lib/receipt-no";
import { recomputeCollectionTotal } from "@/lib/collections";
import { feeAppliesToStudent } from "@/lib/formulas";

// GET /api/payments?student_id=&fee_id=&collection_id=&status=&from=&to=&q= (paymentRecorder)
export async function GET(req: NextRequest) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req);
    const sp = req.nextUrl.searchParams;

    let q = db.from("payments").select("*, student:students(id,student_no,first_name,last_name), fee:fees(id,name), collection:collections(id,collection_date,academic_year,semester,status)", { count: "exact" });
    if (sp.get("trash") === "true") q = q.not("deleted_at", "is", null);
    else q = q.is("deleted_at", null);

    const studentId = sp.get("student_id");
    if (studentId) q = q.eq("student_id", studentId);
    const feeId = sp.get("fee_id");
    if (feeId) q = q.eq("fee_id", feeId);
    const collectionId = sp.get("collection_id");
    if (collectionId) q = q.eq("collection_id", collectionId);
    const status = sp.get("status");
    if (status) q = q.eq("status", status);
    const mode = sp.get("mode");
    if (mode) q = q.eq("mode", mode);
    const from = sp.get("from");
    if (from) q = q.gte("payment_date", from);
    const to = sp.get("to");
    if (to) q = q.lte("payment_date", to);
    const year = sp.get("academic_year");
    if (year) q = q.eq("academic_year", year);
    if (p.q) {
      const term = p.q.replace(/[%,()]/g, " ").trim();
      q = q.or(`receipt_no.ilike.%${term}%,reference_no.ilike.%${term}%`);
    }

    const { data, count, error } = await q
      .order("payment_date", { ascending: false })
      .order("id", { ascending: false })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}

const createSchema = z.object({
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

// POST /api/payments — record a payment, auto-issue receipt number (paymentRecorder)
export async function POST(req: NextRequest) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;

  const body = await parseBody(req, createSchema);
  if (body.error) return body.error;
  const input = body.data;

  try {
    const db = createAdminClient();

    const { data: student } = await db
      .from("students")
      .select("id,student_no,year_level")
      .eq("id", input.student_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!student) return notFound("Student not found");

    // Cross-field checks: a payment must agree with the fee and the batch it
    // is booked against, otherwise per-year and per-fee reports can never be
    // reconciled with each other.
    let fee: { id: number; academic_year: string; semester: string } | null = null;
    if (input.fee_id) {
      const { data: feeRow } = await db
        .from("fees")
        .select("id,academic_year,semester,is_active")
        .eq("id", input.fee_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!feeRow) return notFound("Fee not found");
      if (!feeRow.is_active) return conflict("This fee is inactive");
      if (input.academic_year !== feeRow.academic_year) {
        return badRequest(
          `Academic year ${input.academic_year} does not match the fee's ${feeRow.academic_year}`,
        );
      }
      if (input.semester && input.semester !== feeRow.semester) {
        return badRequest(`Semester ${input.semester} does not match the fee's ${feeRow.semester}`);
      }
      fee = feeRow;
    }
    if (input.collection_id) {
      const { data: col } = await db
        .from("collections")
        .select("id,status,academic_year,semester,deleted_at")
        .eq("id", input.collection_id)
        .maybeSingle();
      if (!col || col.deleted_at) return notFound("Collection not found");
      if (col.status !== "active") return conflict("That batch is closed — no new payments can be added");
      if (input.academic_year !== col.academic_year) {
        return badRequest(
          `Academic year ${input.academic_year} does not match the batch's ${col.academic_year}`,
        );
      }
    }

    // Payments for a fee the student is not targeted for are allowed (manual
    // corrections happen), but they are flagged in the audit trail.
    let targeted = true;
    if (fee) {
      const { data: targets } = await db
        .from("fee_targets")
        .select("student_id,year_level")
        .eq("fee_id", fee.id);
      targeted = feeAppliesToStudent(
        { id: student.id, year_level: student.year_level },
        targets ?? [],
      );
    }

    const receiptNo = await nextReceiptNo();
    const { data, error } = await db
      .from("payments")
      .insert({
        ...input,
        fee_id: input.fee_id ?? null,
        collection_id: input.collection_id ?? null,
        semester: input.semester ?? fee?.semester ?? null,
        receipt_no: receiptNo,
        created_by: auth.profile.username,
      })
      .select("*")
      .single();
    if (error) return serverError(error);

    if (input.collection_id) {
      await recomputeCollectionTotal(db, input.collection_id);
    }

    await logAction(auth.profile.username, "create", "payments", data.id, {
      receipt_no: receiptNo,
      amount: input.amount,
      student_id: input.student_id,
      ...(targeted ? {} : { not_targeted: true }),
    });
    return created({ payment: data });
  } catch (err) {
    return serverError(err);
  }
}
