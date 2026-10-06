import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { created, listResponse, paging, parseBody, serverError, conflict } from "@/lib/api";
import { logAction } from "@/lib/audit";
import { round2 } from "@/lib/formulas";

// GET /api/igps?is_active=&q= — projects with income totals (igpEditor)
export async function GET(req: NextRequest) {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req);
    const sp = req.nextUrl.searchParams;

    let q = db.from("igps").select("*, category:categories(id,name)", { count: "exact" });
    if (sp.get("trash") === "true") q = q.not("deleted_at", "is", null);
    else q = q.is("deleted_at", null);
    const active = sp.get("is_active");
    if (active === "true") q = q.eq("is_active", true);
    if (active === "false") q = q.eq("is_active", false);
    if (p.q) {
      const term = p.q.replace(/[%,()]/g, " ").trim();
      q = q.or(`name.ilike.%${term}%,description.ilike.%${term}%,custodian.ilike.%${term}%`);
    }

    const { data, count, error } = await q
      .order("name", { ascending: true })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);

    const { data: incomeRows } = await db
      .from("income")
      .select("igp_id,amount")
      .is("deleted_at", null)
      .not("igp_id", "is", null)
      .limit(20000);
    const totals = new Map<string, { total: number; count: number }>();
    for (const r of incomeRows ?? []) {
      const key = String(r.igp_id);
      const entry = totals.get(key) ?? { total: 0, count: 0 };
      entry.total += Number(r.amount);
      entry.count += 1;
      totals.set(key, entry);
    }

    const items = (data ?? []).map((igp) => {
      const t = totals.get(String(igp.id)) ?? { total: 0, count: 0 };
      return { ...igp, total_income: round2(t.total), income_count: t.count };
    });

    return listResponse(items, count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullish(),
  category_id: z.coerce.number().int().positive().nullish(),
  custodian: z.string().max(150).nullish(),
  is_active: z.boolean().optional(),
});

// POST /api/igps — create an IGP project (igpEditor)
export async function POST(req: NextRequest) {
  const auth = await requireRole("igpEditor");
  if (auth.response) return auth.response;

  const body = await parseBody(req, createSchema);
  if (body.error) return body.error;

  try {
    const db = createAdminClient();
    const { data: existing } = await db
      .from("igps")
      .select("id")
      .ilike("name", body.data.name)
      .maybeSingle();
    if (existing) return conflict("An IGP with this name already exists");

    const { data, error } = await db
      .from("igps")
      .insert({
        name: body.data.name,
        description: body.data.description ?? null,
        category_id: body.data.category_id ?? null,
        custodian: body.data.custodian ?? null,
        is_active: body.data.is_active ?? true,
      })
      .select("*, category:categories(id,name)")
      .single();
    if (error) {
      if (error.code === "23505") return conflict("An IGP with this name already exists");
      return serverError(error);
    }

    await logAction(auth.profile.username, "create", "igps", data.id, { name: body.data.name });
    return created({ igp: data });
  } catch (err) {
    return serverError(err);
  }
}
