import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/payments/[id]/receipt — receipt payload for screen/PDF (paymentRecorder)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("payments")
      .select(
        "*, student:students(*), fee:fees(id,name,amount), collection:collections(id,collection_date,academic_year)",
      )
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Payment not found");

    const { data: settings } = await db.from("system_settings").select("key,value");
    const school = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));

    await logAction(auth.profile.username, "print", "payments", id, {
      receipt_no: data.receipt_no,
    });
    return ok({ receipt: data, school });
  } catch (err) {
    return serverError(err);
  }
}
