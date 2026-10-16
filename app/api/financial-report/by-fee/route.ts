import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { ok, serverError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { round2, feeAppliesToStudent } from "@/lib/formulas";
import { fetchAllByKeyset, PAGE_LIMIT } from "@/lib/supabase/paged";
import { readFilters } from "@/lib/report-data";

// GET /api/financial-report/by-fee?academic_year=&semester= — collection progress per fee (treasurer)
export async function GET(req: NextRequest) {
  const auth = await requireRole("treasurer");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const f = readFilters(req.nextUrl.searchParams);

    const [fees, payments, students, targets] = await Promise.all([
      fetchAllByKeyset((cursor) => {
        let q = db
          .from("fees")
          .select("id,name,amount,academic_year,semester,due_date")
          .is("deleted_at", null)
          .eq("is_active", true);
        if (f.academic_year) q = q.eq("academic_year", f.academic_year);
        if (f.semester) q = q.eq("semester", f.semester);
        return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
      }),
      fetchAllByKeyset((cursor) =>
        db
          .from("payments")
          .select("id,fee_id,amount")
          .eq("status", "posted")
          .is("deleted_at", null)
          .gt("id", cursor)
          .limit(PAGE_LIMIT)
          .order("id", { ascending: true }),
      ),
      fetchAllByKeyset((cursor) =>
        db
          .from("students")
          .select("id,year_level")
          .is("deleted_at", null)
          .gt("id", cursor)
          .limit(PAGE_LIMIT)
          .order("id", { ascending: true }),
      ),
      fetchAllByKeyset((cursor) =>
        db
          .from("fee_targets")
          .select("id,fee_id,student_id,year_level")
          .gt("id", cursor)
          .limit(PAGE_LIMIT)
          .order("id", { ascending: true }),
      ),
    ]);

    const collectedBy = new Map<string, { total: number; count: number }>();
    let unassigned_total = 0;
    for (const p of payments) {
      if (p.fee_id == null) {
        unassigned_total += Number(p.amount);
        continue;
      }
      const key = String(p.fee_id);
      const entry = collectedBy.get(key) ?? { total: 0, count: 0 };
      entry.total += Number(p.amount);
      entry.count += 1;
      collectedBy.set(key, entry);
    }

    const targetsByFee = new Map<string, typeof targets>();
    for (const t of targets) {
      const key = String(t.fee_id);
      const arr = targetsByFee.get(key) ?? [];
      arr.push(t);
      targetsByFee.set(key, arr);
    }

    const items = fees.map((fee) => {
      const collected = collectedBy.get(String(fee.id)) ?? { total: 0, count: 0 };
      const amount = Number(fee.amount);
      const feeTargets = targetsByFee.get(String(fee.id)) ?? [];
      // Expected = per-student amount x the students the fee actually targets.
      const applicable = students.filter((s) => feeAppliesToStudent(s, feeTargets)).length;
      const expected = round2(amount * applicable);
      return {
        fee_id: fee.id,
        name: fee.name,
        amount,
        applicable_students: applicable,
        expected,
        collected: round2(collected.total),
        balance: round2(Math.max(0, expected - collected.total)),
        payments: collected.count,
        academic_year: fee.academic_year,
        semester: fee.semester,
        due_date: fee.due_date,
        progress: expected > 0 ? round2((collected.total / expected) * 100) : collected.total > 0 ? 100 : 0,
      };
    });
    items.sort((a, b) => b.balance - a.balance);

    return ok({ items, unassigned_total: round2(unassigned_total) });
  } catch (err) {
    return serverError(err);
  }
}
