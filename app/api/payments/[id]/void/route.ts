import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

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

    const { data, error } = await db
      .from("payments")
      .update({ status: "void", remarks: reason ?? existing.remarks })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return serverError(error);

    if (existing.collection_id) {
      const { data: col } = await db
        .from("collections")
        .select("total_amount")
        .eq("id", existing.collection_id)
        .maybeSingle();
      if (col) {
        await db
          .from("collections")
          .update({
            total_amount: Number(Math.max(0, Number(col.total_amount) - Number(existing.amount)).toFixed(2)),
          })
          .eq("id", existing.collection_id);
      }
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
