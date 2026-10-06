import { createAdminClient } from "@/lib/supabase/admin";
import { feeAppliesToStudent, paymentStatus, balanceDue } from "@/lib/formulas";

export interface FeeRow {
  student: { id: string; year_level: number; first_name: string; last_name: string; student_no: string };
  paid: number;
  balance: number;
  status: ReturnType<typeof paymentStatus>;
}

export interface FeeWithRows {
  fee: {
    id: string;
    name: string;
    amount: number;
    due_date: string | null;
    academic_year: string;
    semester: string;
  };
  rows: FeeRow[];
}

export type FeeRowsResult =
  | { ok: true; data: FeeWithRows }
  | { ok: false; error: string };

/** Every student the fee applies to, with paid/balance/status (spec §7). */
export async function computeFeeRows(feeId: string): Promise<FeeRowsResult> {
  const db = createAdminClient();

  const [{ data: fee, error: feeErr }, { data: targets, error: tErr }, { data: payments, error: pErr }] =
    await Promise.all([
      db.from("fees").select("id,name,amount,due_date,academic_year,semester").eq("id", feeId).maybeSingle(),
      db.from("fee_targets").select("*").eq("fee_id", feeId),
      db
        .from("payments")
        .select("student_id,amount")
        .eq("fee_id", feeId)
        .is("deleted_at", null)
        .eq("status", "posted"),
    ]);
  if (feeErr) return { ok: false, error: feeErr.message };
  if (!fee) return { ok: false, error: "Fee not found" };
  if (tErr) return { ok: false, error: tErr.message };
  if (pErr) return { ok: false, error: pErr.message };

  const { data: students, error: sErr } = await db
    .from("students")
    .select("id,year_level,first_name,last_name,student_no")
    .is("deleted_at", null);
  if (sErr) return { ok: false, error: sErr.message };

  const paidByStudent = new Map<string, number>();
  for (const p of payments ?? []) {
    const key = String(p.student_id);
    paidByStudent.set(key, (paidByStudent.get(key) ?? 0) + Number(p.amount));
  }

  const amount = Number(fee.amount);
  const rows: FeeRow[] = (students ?? [])
    .filter((s) => feeAppliesToStudent(s, targets ?? []))
    .map((s) => {
      const paid = paidByStudent.get(String(s.id)) ?? 0;
      return {
        student: s,
        paid: Number(paid.toFixed(2)),
        balance: balanceDue(paid, amount),
        status: paymentStatus(paid, amount),
      };
    })
    .sort((a, b) => a.student.last_name.localeCompare(b.student.last_name));

  return { ok: true, data: { fee: { ...fee, amount }, rows } };
}
