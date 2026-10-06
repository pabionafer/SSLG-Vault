import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/roles";
import { notFound, ok, serverError } from "@/lib/api";
import { computeFeeRows } from "@/lib/fee-stats";
import { computeDefaulters } from "@/lib/formulas";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/fees/[id]/defaulters?as_of=YYYY-MM-DD (any logged-in user)
export async function GET(req: NextRequest, ctx: Ctx) {
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
    const asOf = req.nextUrl.searchParams.get("as_of") ?? new Date().toISOString().slice(0, 10);

    const items = computeDefaulters(
      rows.map((r) => ({
        student: r.student,
        fee_id: fee.id,
        fee_name: fee.name,
        amount_due: fee.amount,
        amount_paid: r.paid,
        due_date: fee.due_date,
      })),
      asOf,
    );

    return ok({ fee, items });
  } catch (err) {
    return serverError(err);
  }
}
