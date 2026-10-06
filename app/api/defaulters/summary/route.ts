import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { computeAllDefaulters } from "@/lib/defaulters";
import { sum } from "@/lib/formulas";

// GET /api/defaulters/summary?as_of=&academic_year= (paymentRecorder)
export async function GET(req: NextRequest) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;

  try {
    const sp = req.nextUrl.searchParams;
    const result = await computeAllDefaulters({
      as_of: sp.get("as_of") ?? undefined,
      academic_year: sp.get("academic_year"),
      semester: sp.get("semester"),
    });
    if (!result.ok) return serverError(new Error(result.error));

    const items = result.items;
    const by_year_level: Record<number, number> = {};
    const by_fee: Record<string, number> = {};
    for (const d of items) {
      by_year_level[d.student.year_level] = (by_year_level[d.student.year_level] ?? 0) + d.balance;
      by_fee[d.fee_name] = (by_fee[d.fee_name] ?? 0) + d.balance;
    }
    for (const k of Object.keys(by_fee)) by_fee[k] = Number(by_fee[k].toFixed(2));

    return ok({
      as_of: result.as_of,
      count: items.length,
      students: new Set(items.map((d) => d.student.id)).size,
      total_balance: sum(items.map((d) => d.balance)),
      over_30_days: items.filter((d) => d.days_overdue > 30).length,
      by_year_level,
      by_fee,
    });
  } catch (err) {
    return serverError(err);
  }
}
