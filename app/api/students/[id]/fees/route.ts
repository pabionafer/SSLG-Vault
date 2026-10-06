import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/roles";
import { notFound, ok, serverError } from "@/lib/api";
import { feeAppliesToStudent, paymentStatus, balanceDue } from "@/lib/formulas";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/students/[id]/fees — assigned fees with paid/status/balance (any logged-in user)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireUser();
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();

    const { data: student, error: stErr } = await db
      .from("students")
      .select("id,year_level,first_name,last_name,student_no")
      .eq("id", id)
      .maybeSingle();
    if (stErr) return serverError(stErr);
    if (!student) return notFound("Student not found");

    const [{ data: fees, error: feeErr }, { data: targets, error: tErr }, { data: payments, error: pErr }] =
      await Promise.all([
        db.from("fees").select("*").is("deleted_at", null).eq("is_active", true),
        db.from("fee_targets").select("*"),
        db.from("payments")
          .select("fee_id,amount")
          .eq("student_id", id)
          .is("deleted_at", null)
          .eq("status", "posted"),
      ]);
    if (feeErr) return serverError(feeErr);
    if (tErr) return serverError(tErr);
    if (pErr) return serverError(pErr);

    const paidByFee = new Map<string, number>();
    for (const p of payments ?? []) {
      if (p.fee_id == null) continue;
      const key = String(p.fee_id);
      paidByFee.set(key, (paidByFee.get(key) ?? 0) + Number(p.amount));
    }

    const items = (fees ?? [])
      .map((fee) => {
        const feeTargets = (targets ?? []).filter((t) => String(t.fee_id) === String(fee.id));
        if (!feeAppliesToStudent(student, feeTargets)) return null;
        const paid = paidByFee.get(String(fee.id)) ?? 0;
        return {
          fee_id: fee.id,
          name: fee.name,
          amount: Number(fee.amount),
          academic_year: fee.academic_year,
          semester: fee.semester,
          due_date: fee.due_date,
          category_id: fee.category_id,
          paid: Number(paid.toFixed(2)),
          balance: balanceDue(paid, Number(fee.amount)),
          status: paymentStatus(paid, Number(fee.amount)),
        };
      })
      .filter((x) => x !== null);

    return ok({ items });
  } catch (err) {
    return serverError(err);
  }
}
