import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { listResponse, paging, parseBody, created, serverError, notFound, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

// GET /api/receipts?page= (paymentRecorder)
export async function GET(req: NextRequest) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req);
    const { data, count, error } = await db
      .from("receipts")
      .select("*, payment:payments(id,receipt_no,payment_date,status)", { count: "exact" })
      .order("issued_at", { ascending: false })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}

const issueSchema = z.object({ payment_id: z.coerce.number().int().positive() });

// POST /api/receipts — issue a receipt for a payment (snapshot at issue time) (paymentRecorder)
export async function POST(req: NextRequest) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;

  const body = await parseBody(req, issueSchema);
  if (body.error) return body.error;

  try {
    const db = createAdminClient();
    const { data: payment } = await db
      .from("payments")
      .select("*, student:students(*), fee:fees(id,name)")
      .eq("id", body.data.payment_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!payment) return notFound("Payment not found");

    const { data: existing } = await db
      .from("receipts")
      .select("id")
      .eq("payment_id", payment.id)
      .maybeSingle();
    if (existing) return conflict("Receipt already issued for this payment");

    const snapshot = {
      receipt_no: payment.receipt_no,
      payment_date: payment.payment_date,
      amount: payment.amount,
      mode: payment.mode,
      student_no: payment.student?.student_no,
      student_name: payment.student
        ? `${payment.student.first_name} ${payment.student.last_name}`
        : null,
      fee_name: payment.fee?.name ?? null,
      academic_year: payment.academic_year,
      semester: payment.semester,
    };

    const { data, error } = await db
      .from("receipts")
      .insert({
        receipt_no: payment.receipt_no,
        payment_id: payment.id,
        amount: payment.amount,
        snapshot,
        issued_by: auth.profile.username,
      })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return conflict("Receipt already issued");
      return serverError(error);
    }

    await logAction(auth.profile.username, "create", "receipts", data.id, {
      receipt_no: payment.receipt_no,
    });
    return created({ receipt: data });
  } catch (err) {
    return serverError(err);
  }
}
