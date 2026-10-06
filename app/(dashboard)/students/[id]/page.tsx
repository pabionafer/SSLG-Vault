"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { api } from "@/lib/client/api";
import {
  Badge,
  Confirm,
  EmptyState,
  ErrorNote,
  Spinner,
  btnGhost,
} from "@/components/ui";

interface Student {
  id: number;
  student_no: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  year_level: number;
  course: string | null;
  section: string | null;
  status: string;
  email: string | null;
  contact_no: string | null;
  guardian_name: string | null;
  guardian_contact: string | null;
}

interface FeeItem {
  fee_id: string;
  name: string;
  amount: number;
  paid: number;
  balance: number;
  status: string;
  due_date: string | null;
}

interface PaymentRow {
  id: number;
  receipt_no: string;
  payment_date: string;
  amount: number;
  mode: string;
  status: string;
  fee: { name: string } | null;
}

interface ClearanceRow {
  id: number;
  purpose: string;
  status: string;
  requested_at: string;
  remarks: string | null;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toneFor = (status: string) =>
  status === "Paid" || status === "approved" || status === "released"
    ? "ok"
    : status === "Partial" || status === "pending"
      ? "warn"
      : status === "rejected" || status === "void"
        ? "danger"
        : "neutral";

type Tab = "fees" | "payments" | "clearances";

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { can } = useSession();
  const { push } = useToast();
  const canManage = can("studentManager");

  const [student, setStudent] = useState<Student | null>(null);
  const [tab, setTab] = useState<Tab>("fees");
  const [fees, setFees] = useState<FeeItem[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [clearances, setClearances] = useState<ClearanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<{ kind: string; row: ClearanceRow } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, f, p, c] = await Promise.all([
      api<{ student: Student }>(`/api/students/${id}`),
      api<{ items: FeeItem[] }>(`/api/students/${id}/fees`),
      api<{ items: PaymentRow[] }>(`/api/students/${id}/payments`),
      api<{ items: ClearanceRow[] }>(`/api/students/${id}/clearances`),
    ]);
    if (!s.ok) {
      setError("Student not found");
    } else {
      setStudent(s.data.student);
      setFees(f.data?.items ?? []);
      setPayments(p.data?.items ?? []);
      setClearances(c.data?.items ?? []);
      setError(null);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function runClearanceAction(kind: string) {
    if (!action) return;
    setBusy(true);
    const res = await api(`/api/clearances/${action.row.id}/${kind}`, {
      method: "POST",
      json: {},
    });
    setBusy(false);
    setAction(null);
    if (res.ok) {
      const past = { approve: "approved", reject: "rejected", release: "released" } as const;
      push("success", `Clearance ${past[kind as keyof typeof past] ?? kind}`);
      load();
    } else {
      const data = res.data as { error?: string; blockers?: string[] };
      const blockers = data.blockers?.length ? ` — blocked by: ${data.blockers.join(", ")}` : "";
      push("error", `${data.error ?? "Action failed"}${blockers}`);
    }
  }

  if (loading) return <Spinner />;
  if (error || !student) return <ErrorNote message={error ?? "Student not found"} />;

  const outstanding = fees.reduce((acc, f) => acc + f.balance, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/students" className="text-sm text-primary hover:underline">
            ← Back to students
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            {student.last_name}, {student.first_name}{" "}
            {student.middle_name ? student.middle_name.charAt(0) + "." : ""}
          </h1>
          <p className="text-sm text-muted">
            <span className="font-mono">{student.student_no}</span> · Year{" "}
            {student.year_level} · {student.course ?? "—"}
            {student.section ? ` · ${student.section}` : ""}
          </p>
          <div className="mt-2 flex gap-2">
            <Badge tone={student.status === "enrolled" ? "ok" : "neutral"}>
              {student.status}
            </Badge>
            <Badge tone={outstanding > 0 ? "warn" : "ok"}>
              {outstanding > 0 ? `${php(outstanding)} due` : "No outstanding fees"}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/api/students/export" className={`${btnGhost} no-print`}>
            Export
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="text-xs uppercase text-muted">Email</div>
          <div className="truncate">{student.email || "—"}</div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="text-xs uppercase text-muted">Contact</div>
          <div className="truncate">{student.contact_no || "—"}</div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="text-xs uppercase text-muted">Guardian</div>
          <div className="truncate">{student.guardian_name || "—"}</div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="text-xs uppercase text-muted">Guardian contact</div>
          <div className="truncate">{student.guardian_contact || "—"}</div>
        </div>
      </div>

      <div className="no-print flex gap-1 border-b border-line">
        {(["fees", "payments", "clearances"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold capitalize ${
              tab === t
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        {tab === "fees" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Fee</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Balance</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {fees.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState message="No assigned fees." />
                  </td>
                </tr>
              ) : (
                fees.map((f) => (
                  <tr key={f.fee_id}>
                    <td className="px-3 py-2 font-semibold">{f.name}</td>
                    <td className="px-3 py-2">{php(f.amount)}</td>
                    <td className="px-3 py-2">{php(f.paid)}</td>
                    <td className="px-3 py-2">{php(f.balance)}</td>
                    <td className="px-3 py-2">{f.due_date ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge tone={toneFor(f.status)}>{f.status}</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {tab === "payments" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="px-3 py-2">Receipt</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Fee</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2">Mode</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState message="No payments recorded." />
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 font-mono text-xs">{p.receipt_no}</td>
                      <td className="px-3 py-2">{p.payment_date}</td>
                      <td className="px-3 py-2">{p.fee?.name ?? "—"}</td>
                      <td className="px-3 py-2">{php(p.amount)}</td>
                      <td className="px-3 py-2 capitalize">{p.mode}</td>
                      <td className="px-3 py-2">
                        <Badge tone={p.status === "posted" ? "ok" : "danger"}>{p.status}</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "clearances" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="px-3 py-2">Purpose</th>
                  <th className="px-3 py-2">Requested</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {clearances.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message="No clearance requests." />
                    </td>
                  </tr>
                ) : (
                  clearances.map((c) => (
                    <tr key={c.id}>
                      <td className="px-3 py-2 font-semibold">{c.purpose}</td>
                      <td className="px-3 py-2">
                        {new Date(c.requested_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2">
                        <Badge tone={toneFor(c.status)}>{c.status}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canManage && (
                          <div className="inline-flex gap-2">
                            {c.status === "pending" && (
                              <>
                                <button
                                  type="button"
                                  className="text-primary hover:underline"
                                  onClick={() => setAction({ kind: "approve", row: c })}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="text-danger hover:underline"
                                  onClick={() => setAction({ kind: "reject", row: c })}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            {c.status === "approved" && (
                              <button
                                type="button"
                                className="text-primary hover:underline"
                                onClick={() => setAction({ kind: "release", row: c })}
                              >
                                Release
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Confirm
        open={action !== null}
        title={action ? `${action.kind} clearance` : ""}
        message={
          action
            ? `Are you sure you want to ${action.kind} this clearance?${action.kind === "approve" ? " Approval only succeeds when every fee item is cleared." : ""}`
            : ""
        }
        confirmLabel={action ? action.kind.charAt(0).toUpperCase() + action.kind.slice(1) : "Confirm"}
        danger={action?.kind === "reject"}
        busy={busy}
        onConfirm={() => runClearanceAction(action!.kind)}
        onCancel={() => setAction(null)}
      />
    </div>
  );
}
