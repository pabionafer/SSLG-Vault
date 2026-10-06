import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { serverError } from "@/lib/api";
import { csvResponse, toCsv } from "@/lib/csv";
import { computeAllDefaulters } from "@/lib/defaulters";
import { logAction } from "@/lib/audit";

// GET /api/defaulters/export — CSV (paymentRecorder)
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

    const csv = toCsv(
      result.items.map((d) => ({
        student_no: d.student.student_no,
        student_name: `${d.student.last_name}, ${d.student.first_name}`,
        year_level: d.student.year_level,
        fee_name: d.fee_name,
        amount_due: d.amount_due.toFixed(2),
        amount_paid: d.amount_paid.toFixed(2),
        balance: d.balance.toFixed(2),
        status: d.status,
        due_date: d.due_date,
        days_overdue: d.days_overdue,
      })),
      [
        { key: "student_no" },
        { key: "student_name" },
        { key: "year_level" },
        { key: "fee_name" },
        { key: "amount_due" },
        { key: "amount_paid" },
        { key: "balance" },
        { key: "status" },
        { key: "due_date" },
        { key: "days_overdue" },
      ],
    );

    await logAction(auth.profile.username, "export", "defaulters", null, {
      rows: result.items.length,
      as_of: result.as_of,
    });
    return csvResponse(csv, `defaulters-${result.as_of}.csv`);
  } catch (err) {
    return serverError(err);
  }
}
