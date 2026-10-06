import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { yearlyBalances } from "@/lib/formulas";
import { fetchLedgerRows } from "@/lib/ledger";

type Ctx = { params: Promise<{ year: string }> };

// GET /api/yearly-balance/[year] — snapshot + live numbers for one year (treasurer)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;
  const { year } = await ctx.params;

  try {
    const rows = await fetchLedgerRows();
    const live =
      yearlyBalances(rows).find((r) => r.academic_year === year) ?? {
        academic_year: year,
        total_income: 0,
        total_expenses: 0,
        balance: 0,
      };

    const db = createAdminClient();
    const { data: snapshot, error } = await db
      .from("yearly_balances")
      .select("*")
      .eq("academic_year", year)
      .maybeSingle();
    if (error) return serverError(error);

    return ok({ live, snapshot: snapshot ?? null });
  } catch (err) {
    return serverError(err);
  }
}
