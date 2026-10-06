import { createAdminClient } from "@/lib/supabase/admin";
import { computeStudentFees } from "@/lib/fee-stats";

export interface ClearanceChecklist {
  items: { id: number; label: string; kind: string; status: string; remarks: string | null }[];
  blockers: string[];
}

/** Refresh kind='fee' item statuses from live payment data. Returns blockers. */
export async function refreshFeeItems(
  clearanceId: string,
  studentId: string,
): Promise<ClearanceChecklist> {
  const db = createAdminClient();
  const fees = await computeStudentFees(String(studentId));
  const statusByFeeName = new Map((fees.ok ? fees.items : []).map((f) => [f.name, f]));

  const { data: items, error } = await db
    .from("clearance_items")
    .select("id,label,kind,status,remarks")
    .eq("clearance_id", clearanceId);
  if (error) return { items: [], blockers: ["could not load checklist"] };

  const out = [];
  for (const item of items ?? []) {
    if (item.kind !== "fee") {
      out.push(item);
      continue;
    }
    const fee = statusByFeeName.get(item.label);
    if (!fee) {
      out.push(item);
      continue;
    }
    const nextStatus = fee.status === "Paid" ? "cleared" : "pending";
    const nextRemarks =
      fee.status === "Paid" ? `Paid in full (${fee.paid.toFixed(2)})` : `Balance ${fee.balance.toFixed(2)}`;
    if (item.status !== nextStatus || item.remarks !== nextRemarks) {
      const { data: u } = await db
        .from("clearance_items")
        .update({ status: nextStatus, remarks: nextRemarks })
        .eq("id", item.id)
        .select("id,label,kind,status,remarks")
        .single();
      out.push(u ?? item);
    } else {
      out.push(item);
    }
  }

  const blockers = out
    .filter((i) => i.status !== "cleared" && i.status !== "not_applicable")
    .map((i) => i.label);
  return { items: out, blockers };
}
