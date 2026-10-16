import { createAdminClient } from "@/lib/supabase/admin";
import { feeAppliesToStudent, computeDefaulters, todayISO, type DefaulterResult } from "@/lib/formulas";
import { fetchAllByKeyset, PAGE_LIMIT } from "@/lib/supabase/paged";

export interface GlobalDefaulter extends Omit<DefaulterResult, "student"> {
  student: DefaulterResult["student"] & {
    student_no: string;
    first_name: string;
    last_name: string;
  };
}

export interface DefaulterFilters {
  as_of?: string;
  academic_year?: string | null;
  semester?: string | null;
}

/** Defaulters across every active fee with a due date. */
export async function computeAllDefaulters(filters: DefaulterFilters = {}): Promise<
  { ok: true; items: GlobalDefaulter[]; as_of: string } | { ok: false; error: string }
> {
  const db = createAdminClient();
  const asOf = filters.as_of ?? todayISO();

  const [feesAll, targets, students, payments] = await Promise.all([
    fetchAllByKeyset((cursor) => {
      let q = db
        .from("fees")
        .select("id,name,amount,due_date,academic_year,semester")
        .is("deleted_at", null)
        .eq("is_active", true)
        .not("due_date", "is", null);
      if (filters.academic_year) q = q.eq("academic_year", filters.academic_year);
      if (filters.semester) q = q.eq("semester", filters.semester);
      return q.gt("id", cursor).limit(PAGE_LIMIT).order("id", { ascending: true });
    }),
    fetchAllByKeyset((cursor) =>
      db
        .from("fee_targets")
        .select("id,fee_id,student_id,year_level")
        .gt("id", cursor)
        .limit(PAGE_LIMIT)
        .order("id", { ascending: true }),
    ),
    fetchAllByKeyset((cursor) =>
      db
        .from("students")
        .select("id,student_no,first_name,last_name,year_level")
        .is("deleted_at", null)
        .gt("id", cursor)
        .limit(PAGE_LIMIT)
        .order("id", { ascending: true }),
    ),
    fetchAllByKeyset((cursor) =>
      db
        .from("payments")
        .select("id,fee_id,student_id,amount")
        .is("deleted_at", null)
        .eq("status", "posted")
        .gt("id", cursor)
        .limit(PAGE_LIMIT)
        .order("id", { ascending: true }),
    ),
  ]);

  const paidBy = new Map<string, number>();
  for (const p of payments) {
    if (p.fee_id == null) continue;
    const key = `${p.fee_id}:${p.student_id}`;
    paidBy.set(key, (paidBy.get(key) ?? 0) + Number(p.amount));
  }

  const rows = [];
  for (const fee of feesAll) {
    const feeTargets = targets.filter((t) => String(t.fee_id) === String(fee.id));
    for (const student of students) {
      if (!feeAppliesToStudent(student, feeTargets)) continue;
      rows.push({
        student,
        fee_id: fee.id,
        fee_name: fee.name,
        amount_due: Number(fee.amount),
        amount_paid: paidBy.get(`${fee.id}:${student.id}`) ?? 0,
        due_date: fee.due_date,
      });
    }
  }

  return {
    ok: true,
    items: computeDefaulters(rows, asOf) as unknown as GlobalDefaulter[],
    as_of: asOf,
  };
}
