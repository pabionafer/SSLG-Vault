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

export interface StudentFeeItem {
  fee_id: string;
  name: string;
  amount: number;
  academic_year: string;
  semester: string;
  due_date: string | null;
  category_id: string | null;
  paid: number;
  balance: number;
  status: ReturnType<typeof paymentStatus>;
}

/** All applicable fees for one student with paid/balance/status. */
export async function computeStudentFees(
  studentId: string,
): Promise<{ ok: true; items: StudentFeeItem[]; student: { id: string; year_level: number } } | { ok: false; error: string }> {
  const db = createAdminClient();

  const [{ data: student, error: stErr }, { data: fees, error: feeErr }, { data: targets, error: tErr }, { data: payments, error: pErr }] =
    await Promise.all([
      db.from("students").select("id,year_level,first_name,last_name,student_no").eq("id", studentId).maybeSingle(),
      db.from("fees").select("*").is("deleted_at", null).eq("is_active", true),
      db.from("fee_targets").select("*"),
      db
        .from("payments")
        .select("fee_id,amount")
        .eq("student_id", studentId)
        .is("deleted_at", null)
        .eq("status", "posted"),
    ]);
  if (stErr) return { ok: false, error: stErr.message };
  if (!student) return { ok: false, error: "Student not found" };
  if (feeErr) return { ok: false, error: feeErr.message };
  if (tErr) return { ok: false, error: tErr.message };
  if (pErr) return { ok: false, error: pErr.message };

  const paidByFee = new Map<string, number>();
  for (const p of payments ?? []) {
    if (p.fee_id == null) continue;
    const key = String(p.fee_id);
    paidByFee.set(key, (paidByFee.get(key) ?? 0) + Number(p.amount));
  }

  const items: StudentFeeItem[] = (fees ?? [])
    .map((fee) => {
      const feeTargets = (targets ?? []).filter((t) => String(t.fee_id) === String(fee.id));
      if (!feeAppliesToStudent(student, feeTargets)) return null;
      const paid = paidByFee.get(String(fee.id)) ?? 0;
      const amount = Number(fee.amount);
      return {
        fee_id: String(fee.id),
        name: fee.name,
        amount,
        academic_year: fee.academic_year,
        semester: fee.semester,
        due_date: fee.due_date,
        category_id: fee.category_id == null ? null : String(fee.category_id),
        paid: Number(paid.toFixed(2)),
        balance: balanceDue(paid, amount),
        status: paymentStatus(paid, amount),
      };
    })
    .filter((x): x is StudentFeeItem => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return { ok: true, items, student };
}
