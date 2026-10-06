import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { ok, parseBody, serverError, created } from "@/lib/api";
import { yearlyBalances } from "@/lib/formulas";
import { fetchLedgerRows } from "@/lib/ledger";
import { logAction } from "@/lib/audit";

// GET /api/yearly-balance — live computation + stored snapshots (treasurer)
export async function GET() {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const rows = await fetchLedgerRows();
    const live = yearlyBalances(rows);

    const db = createAdminClient();
    const { data: snapshots, error } = await db
      .from("yearly_balances")
      .select("*")
      .order("academic_year", { ascending: false });
    if (error) return serverError(error);

    return ok({ items: live, snapshots: snapshots ?? [] });
  } catch (err) {
    return serverError(err);
  }
}

const computeSchema = z.object({ academic_year: z.string().min(1).max(20) });

// POST /api/yearly-balance — compute and save a snapshot (treasurer)
export async function POST(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  const body = await parseBody(req, computeSchema);
  if (body.error) return body.error;

  try {
    const rows = await fetchLedgerRows();
    const live = yearlyBalances(rows);
    const found = live.find((r) => r.academic_year === body.data.academic_year);
    const totals = found ?? {
      academic_year: body.data.academic_year,
      total_income: 0,
      total_expenses: 0,
      balance: 0,
    };

    const db = createAdminClient();
    const { data: existing } = await db
      .from("yearly_balances")
      .select("id")
      .eq("academic_year", body.data.academic_year)
      .maybeSingle();

    const { data, error } = await db
      .from("yearly_balances")
      .upsert(
        {
          academic_year: totals.academic_year,
          total_income: totals.total_income,
          total_expenses: totals.total_expenses,
          balance: totals.balance,
          computed_at: new Date().toISOString(),
          prepared_by: auth.profile.username,
        },
        { onConflict: "academic_year" },
      )
      .select("*")
      .single();
    if (error) return serverError(error);

    await logAction(
      auth.profile.username,
      existing ? "update" : "create",
      "yearly_balances",
      data.id,
      { academic_year: data.academic_year, balance: data.balance },
    );
    return existing ? ok({ snapshot: data }) : created({ snapshot: data });
  } catch (err) {
    return serverError(err);
  }
}
