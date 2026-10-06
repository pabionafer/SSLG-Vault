import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/roles";
import { created, listResponse, paging, parseBody, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

// GET /api/students?q=&year_level=&course=&status=&trash=&page= (any logged-in user)
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req);
    const sp = req.nextUrl.searchParams;

    let q = db.from("students").select("*", { count: "exact" });
    if (sp.get("trash") === "true") q = q.not("deleted_at", "is", null);
    else q = q.is("deleted_at", null);

    const year = sp.get("year_level");
    if (year) q = q.eq("year_level", Number(year));
    const course = sp.get("course");
    if (course) q = q.eq("course", course);
    const status = sp.get("status");
    if (status) q = q.eq("status", status);
    if (p.q) {
      const term = p.q.replace(/[%,()]/g, " ").trim();
      q = q.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,student_no.ilike.%${term}%`,
      );
    }

    const { data, count, error } = await q
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}

const createSchema = z.object({
  student_no: z.string().min(1).max(40),
  first_name: z.string().min(1).max(80),
  last_name: z.string().min(1).max(80),
  middle_name: z.string().max(80).nullish(),
  year_level: z.number().int().min(1).max(6),
  course: z.string().max(80).nullish(),
  section: z.string().max(40).nullish(),
  status: z.enum(["enrolled", "graduated", "transferred", "dropped"]).optional(),
  email: z.string().email().nullish().or(z.literal("")),
  contact_no: z.string().max(40).nullish(),
  guardian_name: z.string().max(120).nullish(),
  guardian_contact: z.string().max(40).nullish(),
});

// POST /api/students (studentManager: admin, treasurer, president)
export async function POST(req: NextRequest) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;

  const body = await parseBody(req, createSchema);
  if (body.error) return body.error;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("students")
      .insert({ ...body.data, created_by: auth.profile.username })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return conflict("Student number already exists");
      return serverError(error);
    }
    await logAction(auth.profile.username, "create", "students", data.id, {
      student_no: data.student_no,
    });
    return created({ student: data });
  } catch (err) {
    return serverError(err);
  }
}
