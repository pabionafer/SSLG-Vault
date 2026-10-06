import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, serverError } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/students/[id]/restore (studentManager)
export async function POST(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("students")
      .update({ deleted_at: null })
      .eq("id", id)
      .not("deleted_at", "is", null)
      .select("*")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Deleted student not found");
    await logAction(auth.profile.username, "restore", "students", id, {
      student_no: data.student_no,
    });
    return ok({ student: data });
  } catch (err) {
    return serverError(err);
  }
}
