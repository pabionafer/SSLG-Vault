import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, ok, parseBody, serverError } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/expenses/[id] (expenseManager)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("expenseManager");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("expenses")
      .select("*, category:categories(id,name,type)")
      .eq("id", id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Expense not found");
    return ok({ expense: data });
  } catch (err) {
    return serverError(err);
  }
}

const patchSchema = z.object({
  description: z.string().min(1).max(300).optional(),
  amount: z.coerce.number().min(0).max(99_999_999).optional(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category_id: z.coerce.number().int().positive().nullish(),
  voucher_no: z.string().max(60).nullish(),
  payee: z.string().max(150).nullish(),
  academic_year: z.string().min(1).optional(),
  semester: z.enum(["1st Semester", "2nd Semester", "Summer"]).nullish(),
  status: z.enum(["draft", "posted", "void"]).optional(),
});

// PATCH /api/expenses/[id] — correct details or change status (expenseManager)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("expenseManager");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, patchSchema);
  if (body.error) return body.error;
  if (Object.keys(body.data).length === 0) return ok({ expense: null, note: "no changes" });

  try {
    const db = createAdminClient();
    const updates: Record<string, unknown> = { ...body.data };
    if (updates.voucher_no === "") updates.voucher_no = null;
    if (updates.payee === "") updates.payee = null;
    if (updates.semester === "") updates.semester = null;

    const { data, error } = await db
      .from("expenses")
      .update(updates)
      .eq("id", id)
      .is("deleted_at", null)
      .select("*, category:categories(id,name,type)")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Expense not found");

    await logAction(auth.profile.username, "update", "expenses", id, {
      fields: Object.keys(updates),
    });
    return ok({ expense: data });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/expenses/[id] — soft delete (expenseManager)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("expenseManager");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("expenses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null)
      .select("*")
      .maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("Expense not found");

    await logAction(auth.profile.username, "delete", "expenses", id, {
      description: data.description,
      amount: data.amount,
    });
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
