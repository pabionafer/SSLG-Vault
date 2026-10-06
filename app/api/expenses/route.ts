import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { created, listResponse, paging, parseBody, serverError, notFound } from "@/lib/api";
import { logAction } from "@/lib/audit";

// GET /api/expenses?category_id=&status=&from=&to=&academic_year=&q=&trash= (expenseManager)
export async function GET(req: NextRequest) {
  const auth = await requireRole("expenseManager");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req);
    const sp = req.nextUrl.searchParams;

    let q = db
      .from("expenses")
      .select("*, category:categories(id,name,type)", { count: "exact" });
    if (sp.get("trash") === "true") q = q.not("deleted_at", "is", null);
    else q = q.is("deleted_at", null);

    const categoryId = sp.get("category_id");
    if (categoryId) q = q.eq("category_id", categoryId);
    const status = sp.get("status");
    if (status) q = q.eq("status", status);
    const from = sp.get("from");
    if (from) q = q.gte("expense_date", from);
    const to = sp.get("to");
    if (to) q = q.lte("expense_date", to);
    const year = sp.get("academic_year");
    if (year) q = q.eq("academic_year", year);
    const sem = sp.get("semester");
    if (sem) q = q.eq("semester", sem);
    if (p.q) {
      const term = p.q.replace(/[%,()]/g, " ").trim();
      q = q.or(`description.ilike.%${term}%,payee.ilike.%${term}%,voucher_no.ilike.%${term}%`);
    }

    const { data, count, error } = await q
      .order("expense_date", { ascending: false })
      .order("id", { ascending: false })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}

const createSchema = z.object({
  description: z.string().min(1).max(300),
  amount: z.coerce.number().min(0).max(99_999_999),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category_id: z.coerce.number().int().positive().nullish(),
  voucher_no: z.string().max(60).nullish(),
  payee: z.string().max(150).nullish(),
  academic_year: z.string().min(1),
  semester: z.enum(["1st Semester", "2nd Semester", "Summer"]).nullish(),
  status: z.enum(["draft", "posted", "void"]).optional(),
});

// POST /api/expenses — record an expense (expenseManager)
export async function POST(req: NextRequest) {
  const auth = await requireRole("expenseManager");
  if (auth.response) return auth.response;

  const body = await parseBody(req, createSchema);
  if (body.error) return body.error;
  const input = body.data;

  try {
    const db = createAdminClient();
    if (input.category_id) {
      const { data: cat } = await db.from("categories").select("id").eq("id", input.category_id).maybeSingle();
      if (!cat) return notFound("Category not found");
    }

    const { data, error } = await db
      .from("expenses")
      .insert({
        description: input.description,
        amount: input.amount,
        expense_date: input.expense_date ?? new Date().toISOString().slice(0, 10),
        category_id: input.category_id ?? null,
        voucher_no: input.voucher_no ?? null,
        payee: input.payee ?? null,
        academic_year: input.academic_year,
        semester: input.semester ?? null,
        status: input.status ?? "posted",
        created_by: auth.profile.username,
      })
      .select("*, category:categories(id,name,type)")
      .single();
    if (error) return serverError(error);

    await logAction(auth.profile.username, "create", "expenses", data.id, {
      description: input.description,
      amount: input.amount,
    });
    return created({ expense: data });
  } catch (err) {
    return serverError(err);
  }
}
