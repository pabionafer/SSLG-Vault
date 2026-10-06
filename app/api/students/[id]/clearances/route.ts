import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/roles";
import { notFound, ok, serverError } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/students/[id]/clearances — clearances + items (any logged-in user)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data: student } = await db.from("students").select("id").eq("id", id).maybeSingle();
    if (!student) return notFound("Student not found");

    const { data, error } = await db
      .from("clearances")
      .select("*, clearance_items(*)")
      .eq("student_id", id)
      .is("deleted_at", null)
      .order("requested_at", { ascending: false });
    if (error) return serverError(error);
    return ok({ items: data ?? [] });
  } catch (err) {
    return serverError(err);
  }
}
