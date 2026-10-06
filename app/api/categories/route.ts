import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireUser } from "@/lib/roles";
import { created, listResponse, paging, parseBody, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";

// GET /api/categories?type=&is_active=&q= (any logged-in user)
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req, 100);
    const sp = req.nextUrl.searchParams;

    let q = db.from("categories").select("*", { count: "exact" });
    const type = sp.get("type");
    if (type) q = q.eq("type", type);
    const active = sp.get("is_active");
    if (active === "true" || active === "false") q = q.eq("is_active", active === "true");
    if (p.q) q = q.ilike("name", `%${p.q.replace(/[%,()]/g, " ").trim()}%`);

    const { data, count, error } = await q
      .order("type", { ascending: true })
      .order("name", { ascending: true })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["fee", "expense", "income", "igp"]),
});

// POST /api/categories (treasurer+)
export async function POST(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  const body = await parseBody(req, createSchema);
  if (body.error) return body.error;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("categories")
      .insert(body.data)
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return conflict("Category already exists");
      return serverError(error);
    }
    await logAction(auth.profile.username, "create", "categories", data.id, body.data);
    return created({ category: data });
  } catch (err) {
    return serverError(err);
  }
}
