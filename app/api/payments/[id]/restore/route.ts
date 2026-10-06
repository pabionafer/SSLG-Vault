import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/payments/[id]/restore — out of Trash, clears purge flags (paymentRecorder)
export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data: existing } = await db
      .from("payments")
      .select("*")
      .eq("id", id)
      .not("deleted_at", "is", null)
      .maybeSingle();
    if (!existing) return notFound("Deleted payment not found");

    const { data, error } = await db
      .from("payments")
      .update({
        deleted_at: null,
        deleted_by: null,
        delete_reason: null,
        pending_hard_delete: false,
        pending_hard_delete_at: null,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return serverError(error);

    if (existing.collection_id && existing.status === "posted") {
      const { data: col } = await db
        .from("collections")
        .select("total_amount")
        .eq("id", existing.collection_id)
        .maybeSingle();
      if (col) {
        await db
          .from("collections")
          .update({
            total_amount: Number((Number(col.total_amount) + Number(existing.amount)).toFixed(2)),
          })
          .eq("id", existing.collection_id);
      }
    }

    await logAction(auth.profile.username, "restore", "payments", id, {
      receipt_no: existing.receipt_no,
    });
    return ok({ payment: data });
  } catch (err) {
    return serverError(err);
  }
}
