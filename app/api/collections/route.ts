import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { created, listResponse, paging, parseBody, serverError } from "@/lib/api";
import { logAction } from "@/lib/audit";

// GET /api/collections?status=&from=&to=&academic_year=&page=
// Readable by paymentRecorder so the payment form can offer active batches;
// all mutations stay treasurer+.
export async function GET(req: NextRequest) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req);
    const sp = req.nextUrl.searchParams;

    let q = db.from("collections").select("*", { count: "exact" }).is("deleted_at", null);
    const status = sp.get("status");
    if (status) q = q.eq("status", status);
    const year = sp.get("academic_year");
    if (year) q = q.eq("academic_year", year);
    const from = sp.get("from");
    if (from) q = q.gte("collection_date", from);
    const to = sp.get("to");
    if (to) q = q.lte("collection_date", to);
    if (p.q) q = q.ilike("notes", `%${p.q.replace(/[%,()]/g, " ").trim()}%`);

    const { data, count, error } = await q
      .order("collection_date", { ascending: false })
      .order("id", { ascending: false })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}

const createSchema = z.object({
  collection_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  academic_year: z.string().min(1),
  semester: z.enum(["1st Semester", "2nd Semester", "Summer"]),
  notes: z.string().max(500).nullish(),
});

// POST /api/collections â€” new transmittal batch (treasurer+)
export async function POST(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  const body = await parseBody(req, createSchema);
  if (body.error) return body.error;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("collections")
      .insert({ ...body.data, prepared_by: auth.profile.username })
      .select("*")
      .single();
    if (error) return serverError(error);
    await logAction(auth.profile.username, "create", "collections", data.id, body.data);
    return created({ collection: data });
  } catch (err) {
    return serverError(err);
  }
}
