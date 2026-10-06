import { createAdminClient } from "@/lib/supabase/admin";
import { feeAppliesToStudent, computeDefaulters, type DefaulterResult } from "@/lib/formulas";

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
  const asOf = filters.as_of ?? new Date().toISOString().slice(0, 10);

  let feeQ = db.from("fees").select("*").is("deleted_at", null).eq("is_active", true).not("due_date", "is", null);
  if (filters.academic_year) feeQ = feeQ.eq("academic_year", filters.academic_year);
  if (filters.semester) feeQ = feeQ.eq("semester", filters.semester);

  const [{ data: fees, error: feeErr }, { data: targets, error: tErr }, { data: students, error: sErr }, { data: payments, error: pErr }] =
    await Promise.all([
      feeQ,
      db.from("fee_targets").select("*"),
      db.from("students").select("id,student_no,first_name,last_name,year_level").is("deleted_at", null),
      db.from("payments").select("fee_id,student_id,amount").is("deleted_at", null).eq("status", "posted"),
    ]);
  if (feeErr) return { ok: false, error: feeErr.message };
  if (tErr) return { ok: false, error: tErr.message };
  if (sErr) return { ok: false, error: sErr.message };
  if (pErr) return { ok: false, error: pErr.message };

  const paidBy = new Map<string, number>();
  for (const p of payments ?? []) {
    if (p.fee_id == null) continue;
    const key = `${p.fee_id}:${p.student_id}`;
    paidBy.set(key, (paidBy.get(key) ?? 0) + Number(p.amount));
  }

  const rows = [];
  for (const fee of fees ?? []) {
    const feeTargets = (targets ?? []).filter((t) => String(t.fee_id) === String(fee.id));
    for (const student of students ?? []) {
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
