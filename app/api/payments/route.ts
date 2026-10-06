import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { created, listResponse, paging, parseBody, serverError, notFound } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { nextReceiptNo } from "@/lib/receipt-no";

// GET /api/payments?student_id=&fee_id=&collection_id=&status=&from=&to=&q= (paymentRecorder)
export async function GET(req: NextRequest) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req);
    const sp = req.nextUrl.searchParams;

    let q = db.from("payments").select("*, student:students(id,student_no,first_name,last_name), fee:fees(id,name)", { count: "exact" });
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
  amount: z.coerce.number().positive(),
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
      .select("id,student_no")
      .eq("id", input.student_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!student) return notFound("Student not found");

    if (input.fee_id) {
      const { data: fee } = await db.from("fees").select("id").eq("id", input.fee_id).maybeSingle();
      if (!fee) return notFound("Fee not found");
    }
    if (input.collection_id) {
      const { data: col } = await db.from("collections").select("id").eq("id", input.collection_id).maybeSingle();
      if (!col) return notFound("Collection not found");
    }

    const receiptNo = await nextReceiptNo();
    const { data, error } = await db
      .from("payments")
      .insert({
        ...input,
        fee_id: input.fee_id ?? null,
        collection_id: input.collection_id ?? null,
        receipt_no: receiptNo,
        created_by: auth.profile.username,
      })
      .select("*")
      .single();
    if (error) return serverError(error);

    if (input.collection_id) {
      const { data: col } = await db
        .from("collections")
        .select("total_amount")
        .eq("id", input.collection_id)
        .maybeSingle();
      if (col) {
        await db
          .from("collections")
          .update({ total_amount: Number(col.total_amount) + Number(input.amount) })
          .eq("id", input.collection_id);
      }
    }

    await logAction(auth.profile.username, "create", "payments", data.id, {
      receipt_no: receiptNo,
      amount: input.amount,
      student_id: input.student_id,
    });
    return created({ payment: data });
  } catch (err) {
    return serverError(err);
  }
}
