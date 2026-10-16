import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, parseBody, serverError, conflict, moneySchema } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { recomputeCollectionTotal } from "@/lib/collections";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/payments/[id] (paymentRecorder)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("payments")
      .select("*, student:students(*), fee:fees(id,name,amount), collection:collections(id,collection_date)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Payment not found");
    return ok({ payment: data });
  } catch (err) {
    return serverError(err);
  }
}

const patchSchema = z.object({
  amount: moneySchema(0.01).optional(),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mode: z.enum(["cash", "gcash", "bank_transfer", "other"]).optional(),
  reference_no: z.string().max(80).nullish(),
  remarks: z.string().max(500).nullish(),
  semester: z.enum(["1st Semester", "2nd Semester", "Summer"]).nullish(),
});

// PATCH /api/payments/[id] — correct details (paymentRecorder)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, patchSchema);
  if (body.error) return body.error;
  if (Object.keys(body.data).length === 0) return ok({ payment: null, note: "no changes" });

  try {
    const db = createAdminClient();
    const { data: existing } = await db
      .from("payments")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) return notFound("Payment not found");
    if (existing.status !== "posted") return conflict("Only posted payments can be edited — restore or void instead");

    const updates: Record<string, unknown> = { ...body.data };
    if (updates.reference_no === "") updates.reference_no = null;
    if (updates.remarks === "") updates.remarks = null;
    if (updates.semester === "") updates.semester = null;

    const { data, error } = await db
      .from("payments")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return serverError(error);

    if (typeof updates.amount === "number" && existing.collection_id) {
      await recomputeCollectionTotal(db, existing.collection_id);
    }

    await logAction(auth.profile.username, "update", "payments", id, {
      receipt_no: existing.receipt_no,
      fields: Object.keys(updates),
    });
    return ok({ payment: data });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/payments/[id] — soft delete (paymentRecorder)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data: existing } = await db
      .from("payments")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) return notFound("Payment not found");

    const { error } = await db
      .from("payments")
      .update({ deleted_at: new Date().toISOString(), deleted_by: auth.profile.username })
      .eq("id", id);
    if (error) return serverError(error);

    if (existing.collection_id) {
      await recomputeCollectionTotal(db, existing.collection_id);
    }

    await logAction(auth.profile.username, "delete", "payments", id, {
      receipt_no: existing.receipt_no,
      amount: existing.amount,
    });
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
