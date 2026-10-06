import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/receipts/[id] (paymentRecorder)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("receipts")
      .select("*, payment:payments(*, student:students(*), fee:fees(id,name))")
      .eq("id", id)
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Receipt not found");
    return ok({ receipt: data });
  } catch (err) {
    return serverError(err);
  }
}
