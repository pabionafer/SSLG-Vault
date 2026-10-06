import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/roles";
import { listResponse, notFound, paging, serverError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/students/[id]/payments — payment history (any logged-in user)
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data: student } = await db.from("students").select("id").eq("id", id).maybeSingle();
    if (!student) return notFound("Student not found");

    const p = paging(req, 50);
    const { data, count, error } = await db
      .from("payments")
      .select("*, fee:fees(id,name)", { count: "exact" })
      .eq("student_id", id)
      .is("deleted_at", null)
      .order("payment_date", { ascending: false })
      .order("id", { ascending: false })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}
