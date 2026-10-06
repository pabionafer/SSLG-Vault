import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/roles";
import { notFound, ok, serverError } from "@/lib/api";
import { computeFeeRows } from "@/lib/fee-stats";
import { sum } from "@/lib/formulas";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/fees/[id]/stats — expected vs collected vs outstanding (any logged-in user)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const result = await computeFeeRows(id);
    if (!result.ok) {
      return result.error === "Fee not found"
        ? notFound(result.error)
        : serverError(new Error(result.error));
    }
    const { fee, rows } = result.data;
    const expected = sum(rows.map(() => fee.amount));
    const collected = sum(rows.map((r) => r.paid));
    const outstanding = sum(rows.map((r) => r.balance));
    const paidCount = rows.filter((r) => r.status === "Paid").length;

    return ok({
      fee,
      stats: {
        students: rows.length,
        expected,
        collected,
        outstanding,
        students_paid: paidCount,
        students_unpaid: rows.length - paidCount,
        collection_rate: expected > 0 ? Number(((collected / expected) * 100).toFixed(2)) : 0,
      },
    });
  } catch (err) {
    return serverError(err);
  }
}
