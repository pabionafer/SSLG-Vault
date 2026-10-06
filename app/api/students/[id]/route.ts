import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/roles";
import { notFound, ok, parseBody, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/students/[id] (any logged-in user)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db.from("students").select("*").eq("id", id).maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Student not found");
    return ok({ student: data });
  } catch (err) {
    return serverError(err);
  }
}

const patchSchema = z.object({
  student_no: z.string().min(1).max(40).optional(),
  first_name: z.string().min(1).max(80).optional(),
  last_name: z.string().min(1).max(80).optional(),
  middle_name: z.string().max(80).nullish(),
  year_level: z.number().int().min(1).max(6).optional(),
  course: z.string().max(80).nullish(),
  section: z.string().max(40).nullish(),
  status: z.enum(["enrolled", "graduated", "transferred", "dropped"]).optional(),
  email: z.string().email().nullish().or(z.literal("")),
  contact_no: z.string().max(40).nullish(),
  guardian_name: z.string().max(120).nullish(),
  guardian_contact: z.string().max(40).nullish(),
});

// PATCH /api/students/[id] (studentManager)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, patchSchema);
  if (body.error) return body.error;
  if (Object.keys(body.data).length === 0) return ok({ student: null, note: "no changes" });

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("students")
      .update(body.data)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") return conflict("Student number already exists");
      return serverError(error);
    }
    if (!data) return notFound("Student not found");
    await logAction(auth.profile.username, "update", "students", id, {
      student_no: data.student_no,
      fields: Object.keys(body.data),
    });
    return ok({ student: data });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/students/[id] — soft delete to Trash (studentManager)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("students")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Student not found");
    await logAction(auth.profile.username, "delete", "students", id, {
      student_no: data.student_no,
    });
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
