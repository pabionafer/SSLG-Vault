import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { recomputeCollectionTotal } from "@/lib/collections";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/payments/[id]/void — status=void, stays in the ledger (paymentRecorder)
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  let reason: string | undefined;
  try {
    const j = (await req.json()) as { reason?: unknown };
    if (typeof j.reason === "string") reason = j.reason.slice(0, 300);
  } catch {
    /* empty body is fine */
  }

  try {
    const db = createAdminClient();
    const { data: existing } = await db
      .from("payments")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!existing) return notFound("Payment not found");
    if (existing.status === "void") return conflict("Payment is already void");

    // Keep the recorder's original remarks; append the void reason instead of
    // overwriting it (the reason is also written to the audit log).
    const remarks =
      reason == null
        ? existing.remarks
        : existing.remarks
          ? `${existing.remarks} | void: ${reason}`
          : reason;

    const { data, error } = await db
      .from("payments")
      .update({ status: "void", remarks })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return serverError(error);

    if (existing.collection_id) {
      await recomputeCollectionTotal(db, existing.collection_id);
    }

    await logAction(auth.profile.username, "void", "payments", id, {
      receipt_no: existing.receipt_no,
      reason: reason ?? null,
    });
    return ok({ payment: data });
  } catch (err) {
    return serverError(err);
  }
}
