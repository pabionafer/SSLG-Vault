import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/roles";
import { notFound, ok, serverError } from "@/lib/api";
import { computeStudentFees } from "@/lib/fee-stats";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/students/[id]/fees — assigned fees with paid/status/balance (any logged-in user)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const result = await computeStudentFees(id);
    if (!result.ok) {
      return result.error === "Student not found"
        ? notFound(result.error)
        : serverError(new Error(result.error));
    }
    const db = createAdminClient();
    const { data: student } = await db
      .from("students")
      .select("id,student_no,first_name,last_name,year_level")
      .eq("id", id)
      .maybeSingle();
    return ok({ student, items: result.items });
  } catch (err) {
    return serverError(err);
  }
}
