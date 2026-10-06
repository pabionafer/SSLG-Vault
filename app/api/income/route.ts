import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { created, listResponse, paging, parseBody, serverError, notFound, badRequest } from "@/lib/api";
import { logAction } from "@/lib/audit";

// GET /api/income?igp_id=&source=&from=&to=&academic_year=&q= (igpEditor)
export async function GET(req: NextRequest) {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req);
    const sp = req.nextUrl.searchParams;

    let q = db
      .from("income")
      .select("*, igp:igps(id,name), category:categories(id,name)", { count: "exact" });
    if (sp.get("trash") === "true") q = q.not("deleted_at", "is", null);
    else q = q.is("deleted_at", null);
    const igpId = sp.get("igp_id");
    if (igpId) q = q.eq("igp_id", igpId);
    const source = sp.get("source");
    if (source) q = q.eq("source", source);
    const from = sp.get("from");
    if (from) q = q.gte("income_date", from);
    const to = sp.get("to");
    if (to) q = q.lte("income_date", to);
    const year = sp.get("academic_year");
    if (year) q = q.eq("academic_year", year);
    const sem = sp.get("semester");
    if (sem) q = q.eq("semester", sem);
    if (p.q) {
      const term = p.q.replace(/[%,()]/g, " ").trim();
      q = q.or(`description.ilike.%${term}%,reference_no.ilike.%${term}%`);
    }

    const { data, count, error } = await q
      .order("income_date", { ascending: false })
      .order("id", { ascending: false })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}

const createSchema = z
  .object({
    description: z.string().min(1).max(300),
    amount: z.coerce.number().positive().max(99_999_999),
    income_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    source: z.enum(["igp", "other"]).optional(),
    igp_id: z.coerce.number().int().positive().nullish(),
    category_id: z.coerce.number().int().positive().nullish(),
    reference_no: z.string().max(60).nullish(),
    academic_year: z.string().min(1),
    semester: z.enum(["1st Semester", "2nd Semester", "Summer"]).nullish(),
  })
  .superRefine((val, ctx) => {
    if (val.source === "igp" && !val.igp_id) {
      ctx.addIssue({ code: "custom", message: "igp_id is required when source is 'igp'" });
    }
  });

// POST /api/income — record IGP earnings or other income (igpEditor)
export async function POST(req: NextRequest) {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;

  const body = await parseBody(req, createSchema);
  if (body.error) return body.error;
  const input = body.data;

  try {
    const db = createAdminClient();
    if (input.igp_id) {
      const { data: igp } = await db
        .from("igps")
        .select("id")
        .eq("id", input.igp_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (!igp) return notFound("IGP not found");
    }
    if (input.category_id) {
      const { data: cat } = await db.from("categories").select("id").eq("id", input.category_id).maybeSingle();
      if (!cat) return notFound("Category not found");
    }

    const source = input.source ?? (input.igp_id ? "igp" : "other");
    if (source === "igp" && !input.igp_id) return badRequest("igp_id is required when source is 'igp'");

    const { data, error } = await db
      .from("income")
      .insert({
        description: input.description,
        amount: input.amount,
        income_date: input.income_date ?? new Date().toISOString().slice(0, 10),
        source,
        igp_id: input.igp_id ?? null,
        category_id: input.category_id ?? null,
        reference_no: input.reference_no ?? null,
        academic_year: input.academic_year,
        semester: input.semester ?? null,
        created_by: auth.profile.username,
      })
      .select("*, igp:igps(id,name), category:categories(id,name)")
      .single();
    if (error) return serverError(error);

    await logAction(auth.profile.username, "create", "income", data.id, {
      description: input.description,
      amount: input.amount,
      source,
    });
    return created({ income: data });
  } catch (err) {
    return serverError(err);
  }
}
