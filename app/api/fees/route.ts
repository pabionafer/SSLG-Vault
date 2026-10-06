import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/roles";
import { created, listResponse, paging, parseBody, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

// GET /api/fees?academic_year=&semester=&q=&is_active=&page= (any logged-in user)
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req);
    const sp = req.nextUrl.searchParams;

    let q = db.from("fees").select("*, category:categories(id,name)", { count: "exact" });
    if (sp.get("trash") === "true") q = q.not("deleted_at", "is", null);
    else q = q.is("deleted_at", null);
    const year = sp.get("academic_year");
    if (year) q = q.eq("academic_year", year);
    const sem = sp.get("semester");
    if (sem) q = q.eq("semester", sem);
    const active = sp.get("is_active");
    if (active === "true" || active === "false") q = q.eq("is_active", active === "true");
    if (p.q) {
      const term = p.q.replace(/[%,()]/g, " ").trim();
      q = q.ilike("name", `%${term}%`);
    }

    const { data, count, error } = await q
      .order("name", { ascending: true })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}

const targetSchema = z.object({
  student_id: z.coerce.number().int().positive().nullish(),
  year_level: z.coerce.number().int().min(1).max(6).nullish(),
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  category_id: z.coerce.number().int().positive().nullish(),
  amount: z.coerce.number().min(0),
  academic_year: z.string().min(1),
  semester: z.enum(["1st Semester", "2nd Semester", "Summer"]),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .or(z.literal("")),
  description: z.string().max(500).nullish(),
  is_active: z.boolean().optional(),
  targets: z.array(targetSchema).optional(),
});

// POST /api/fees — create fee (+ optional target set; empty = everyone) (treasurer+)
export async function POST(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  const body = await parseBody(req, createSchema);
  if (body.error) return body.error;
  const { targets, ...fee } = body.data;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("fees")
      .insert({ ...fee, due_date: fee.due_date || null, created_by: auth.profile.username })
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return conflict("A fee with this name already exists for the period");
      return serverError(error);
    }

    if (targets && targets.length > 0) {
      const rows = targets.map((t) => ({
        fee_id: data.id,
        student_id: t.student_id ?? null,
        year_level: t.year_level ?? null,
      }));
      const { error: tErr } = await db.from("fee_targets").insert(rows);
      if (tErr) return serverError(tErr);
    }

    await logAction(auth.profile.username, "create", "fees", data.id, {
      name: data.name,
      amount: data.amount,
      targets: targets?.length ?? 0,
    });
    return created({ fee: data });
  } catch (err) {
    return serverError(err);
  }
}
