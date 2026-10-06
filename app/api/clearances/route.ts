import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { created, listResponse, paging, parseBody, serverError, notFound, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { computeStudentFees } from "@/lib/fee-stats";

// GET /api/clearances?status=&student_id=&q= (studentManager)
export async function GET(req: NextRequest) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req);
    const sp = req.nextUrl.searchParams;

    let q = db
      .from("clearances")
      .select("*, student:students(id,student_no,first_name,last_name,year_level)", { count: "exact" })
      .is("deleted_at", null);
    const status = sp.get("status");
    if (status) q = q.eq("status", status);
    const studentId = sp.get("student_id");
    if (studentId) q = q.eq("student_id", studentId);
    if (p.q) {
      const term = p.q.replace(/[%,()]/g, " ").trim();
      q = q.ilike("purpose", `%${term}%`);
    }

    const { data, count, error } = await q
      .order("requested_at", { ascending: false })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}

const createSchema = z.object({
  student_id: z.coerce.number().int().positive(),
  purpose: z.string().min(1).max(200),
  academic_year: z.string().max(20).nullish(),
});

// POST /api/clearances — open a clearance; fee checklist built from live fee status (studentManager)
export async function POST(req: NextRequest) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;

  const body = await parseBody(req, createSchema);
  if (body.error) return body.error;

  try {
    const db = createAdminClient();
    const { data: student } = await db
      .from("students")
      .select("id")
      .eq("id", body.data.student_id)
      .is("deleted_at", null)
      .maybeSingle();
    if (!student) return notFound("Student not found");

    const { data: existing } = await db
      .from("clearances")
      .select("id")
      .eq("student_id", body.data.student_id)
      .eq("status", "pending")
      .is("deleted_at", null)
      .maybeSingle();
    if (existing) return conflict("A pending clearance already exists for this student");

    const fees = await computeStudentFees(String(body.data.student_id));
    const feeItems = fees.ok
      ? fees.items.map((f) => ({
          label: f.name,
          kind: "fee" as const,
          status: f.status === "Paid" ? ("cleared" as const) : ("pending" as const),
          remarks: f.status === "Paid" ? `Paid in full (${f.paid.toFixed(2)})` : `Balance ${f.balance.toFixed(2)}`,
        }))
      : [];

    const { data, error } = await db
      .from("clearances")
      .insert({
        student_id: body.data.student_id,
        purpose: body.data.purpose,
        academic_year: body.data.academic_year ?? null,
        created_by: auth.profile.username,
      })
      .select("*")
      .single();
    if (error) return serverError(error);

    if (feeItems.length > 0) {
      const { error: itemErr } = await db
        .from("clearance_items")
        .insert(feeItems.map((i) => ({ ...i, clearance_id: data.id })));
      if (itemErr) return serverError(itemErr);
    }

    await logAction(auth.profile.username, "create", "clearances", data.id, {
      student_id: body.data.student_id,
      fee_items: feeItems.length,
    });
    return created({ clearance: data });
  } catch (err) {
    return serverError(err);
  }
}
