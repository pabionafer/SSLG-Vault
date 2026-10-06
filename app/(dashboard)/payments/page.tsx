"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { api } from "@/lib/client/api";
import {
  Badge,
  Confirm,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Pagination,
  Spinner,
  btnGhost,
  btnPrimary,
  inputCls,
} from "@/components/ui";

interface Payment {
  id: number;
  receipt_no: string;
  student_id: number;
  fee_id: number | null;
  amount: number;
  payment_date: string;
  mode: string;
  status: string;
  reference_no: string | null;
  academic_year: string;
  semester: string | null;
  remarks: string | null;
  student: { id: number; student_no: string; first_name: string; last_name: string } | null;
  fee: { id: number; name: string } | null;
}

interface Summary {
  count: number;
  total: number;
  by_mode: Record<string, { count: number; total: number }>;
}

interface StudentHit {
  id: number;
  student_no: string;
  first_name: string;
  last_name: string;
}

interface FeeHit {
  id: string;
  name: string;
  amount: number;
}

interface ReceiptPayload {
  receipt: Payment & {
    student: Record<string, unknown>;
    fee: { name: string; amount: number } | null;
  };
  school: Record<string, string>;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MODES = ["cash", "gcash", "bank_transfer", "other"] as const;

function defaultAcademicYear() {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() + 1 >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function PaymentsPage() {
  const { can } = useSession();
  const { push } = useToast();
  const canManage = can("paymentRecorder");

  const [rows, setRows] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [mode, setMode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const limit = 25;

  const [recordOpen, setRecordOpen] = useState(false);
  const [form, setForm] = useState({
    student_id: "" as string,
    fee_id: "",
    amount: "",
    payment_date: today(),
    mode: "cash",
    reference_no: "",
    academic_year: defaultAcademicYear(),
    semester: "",
    remarks: "",
  });
  const [pickedStudent, setPickedStudent] = useState<StudentHit | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentHits, setStudentHits] = useState<StudentHit[]>([]);
  const [fees, setFees] = useState<FeeHit[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editRow, setEditRow] = useState<Payment | null>(null);
  const [editForm, setEditForm] = useState({
    amount: "",
    payment_date: "",
    mode: "cash",
    reference_no: "",
    semester: "",
    remarks: "",
  });

  const [voidRow, setVoidRow] = useState<Payment | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [receipt, setReceipt] = useState<ReceiptPayload | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [deleting, setDeleting] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (mode) params.set("mode", mode);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await api<{ items: Payment[]; total: number }>(`/api/payments?${params}`);
    if (res.ok) {
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setError(null);
    } else if (res.status !== 401) {
      setError("Could not load payments");
    }
    setLoading(false);
    const sumParams = new URLSearchParams();
    if (from) sumParams.set("from", from);
    if (to) sumParams.set("to", to);
    if (mode) sumParams.set("mode", mode);
    const s = await api<Summary>(`/api/payments/summary?${sumParams}`);
    if (s.ok) setSummary(s.data);
  }, [page, q, status, mode, from, to]);

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api<{ items: FeeHit[] }>("/api/fees?is_active=true&limit=100").then((res) => {
      if (cancelled) return;
      if (res.ok) setFees(res.data.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (studentQuery.trim().length < 2) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      api<{ items: StudentHit[] }>(`/api/students?limit=8&q=${encodeURIComponent(studentQuery.trim())}`).then(
        (res) => {
          if (cancelled) return;
          setStudentHits(res.ok ? (res.data.items ?? []) : []);
        },
      );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [studentQuery]);

  function openRecord() {
    setForm({
      student_id: "",
      fee_id: "",
      amount: "",
      payment_date: today(),
      mode: "cash",
      reference_no: "",
      academic_year: defaultAcademicYear(),
      semester: "",
      remarks: "",
    });
    setPickedStudent(null);
    setStudentQuery("");
    setStudentHits([]);
    setFormError(null);
    setRecordOpen(true);
  }

  async function record() {
    if (!pickedStudent) {
      setFormError("Pick a student first");
      return;
    }
    setSaving(true);
    setFormError(null);
    const res = await api("/api/payments", {
      method: "POST",
      json: {
        student_id: pickedStudent.id,
        fee_id: form.fee_id ? form.fee_id : null,
        amount: Number(form.amount),
        payment_date: form.payment_date,
        mode: form.mode,
        reference_no: form.reference_no.trim() || null,
        academic_year: form.academic_year.trim(),
        semester: form.semester || null,
        remarks: form.remarks.trim() || null,
      },
    });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setFormError(data.error ?? "Could not record payment");
      return;
    }
    const created = (res.data as { payment: Payment }).payment;
    setRecordOpen(false);
    push("success", `Payment recorded — receipt ${created.receipt_no}`);
    load();
  }

  function openEdit(row: Payment) {
    setEditRow(row);
    setEditForm({
      amount: String(row.amount),
      payment_date: row.payment_date,
      mode: row.mode,
      reference_no: row.reference_no ?? "",
      semester: row.semester ?? "",
      remarks: row.remarks ?? "",
    });
  }

  async function saveEdit() {
    if (!editRow) return;
    setBusy(true);
    const res = await api(`/api/payments/${editRow.id}`, {
      method: "PATCH",
      json: {
        amount: Number(editForm.amount),
        payment_date: editForm.payment_date,
        mode: editForm.mode,
        reference_no: editForm.reference_no.trim() || null,
        semester: editForm.semester || null,
        remarks: editForm.remarks.trim() || null,
      },
    });
    setBusy(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not update payment");
      return;
    }
    setEditRow(null);
    push("success", "Payment updated");
    load();
  }

  async function voidPayment() {
    if (!voidRow) return;
    setBusy(true);
    const res = await api(`/api/payments/${voidRow.id}/void`, {
      method: "POST",
      json: { reason: voidReason.trim() || undefined },
    });
    setBusy(false);
    setVoidRow(null);
    setVoidReason("");
    if (res.ok) {
      push("success", "Payment voided");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not void payment");
    }
  }

  async function openReceipt(row: Payment) {
    const res = await api<ReceiptPayload>(`/api/payments/${row.id}/receipt`);
    if (!res.ok) {
      push("error", "Could not load receipt");
      return;
    }
    setReceipt(res.data);
    setReceiptOpen(true);
  }

  async function deletePayment() {
    if (!deleting) return;
    setBusy(true);
    const res = await api(`/api/payments/${deleting.id}`, { method: "DELETE" });
    setBusy(false);
    setDeleting(null);
    if (res.ok) {
      push("success", "Payment moved to Trash");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not delete payment");
    }
  }

  const school = receipt?.school ?? {};
  const schoolName =
    school.school_name ?? school.name ?? school.organization_name ?? "SSLG Treasury";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-sm text-muted">{total} payment records</p>
        </div>
        {canManage && (
          <button type="button" className={btnPrimary} onClick={openRecord}>
            Record payment
          </button>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">Posted total</div>
            <div className="mt-1 text-lg font-bold">{php(summary.total)}</div>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">Payments</div>
            <div className="mt-1 text-lg font-bold">{summary.count}</div>
          </div>
          {Object.entries(summary.by_mode)
            .slice(0, 2)
            .map(([m, v]) => (
              <div key={m} className="rounded-lg border border-line bg-surface p-3">
                <div className="text-xs uppercase text-muted capitalize">{m}</div>
                <div className="mt-1 text-lg font-bold">{php(v.total)}</div>
                <div className="text-xs text-muted">{v.count} transactions</div>
              </div>
            ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="Receipt or reference no…"
          aria-label="Search payments"
          className={`${inputCls} max-w-56`}
        />
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          aria-label="Status"
          className={`${inputCls} w-32`}
        >
          <option value="">All</option>
          <option value="posted">Posted</option>
          <option value="void">Void</option>
        </select>
        <select
          value={mode}
          onChange={(e) => {
            setPage(1);
            setMode(e.target.value);
          }}
          aria-label="Mode"
          className={`${inputCls} w-40`}
        >
          <option value="">All modes</option>
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m.replace("_", " ")}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setPage(1);
            setFrom(e.target.value);
          }}
          aria-label="From date"
          className={`${inputCls} w-40`}
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setPage(1);
            setTo(e.target.value);
          }}
          aria-label="To date"
          className={`${inputCls} w-40`}
        />
      </div>

      {error && <ErrorNote message={error} />}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">Receipt</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Fee</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={8}>
                  <Spinner />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <EmptyState message="No payments match these filters." />
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="hover:bg-tint/40">
                  <td className="px-3 py-2 font-mono text-xs">{p.receipt_no}</td>
                  <td className="px-3 py-2">{p.payment_date}</td>
                  <td className="px-3 py-2">
                    {p.student
                      ? `${p.student.last_name}, ${p.student.first_name}`
                      : `#${p.student_id}`}
                    <div className="font-mono text-xs text-muted">{p.student?.student_no}</div>
                  </td>
                  <td className="px-3 py-2">{p.fee?.name ?? "—"}</td>
                  <td className="px-3 py-2 font-semibold">{php(p.amount)}</td>
                  <td className="px-3 py-2 capitalize">{p.mode.replace("_", " ")}</td>
                  <td className="px-3 py-2">
                    <Badge tone={p.status === "posted" ? "ok" : "danger"}>{p.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => openReceipt(p)}
                      >
                        Receipt
                      </button>
                      {canManage && p.status === "posted" && (
                        <>
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => openEdit(p)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-danger hover:underline"
                            onClick={() => {
                              setVoidRow(p);
                              setVoidReason("");
                            }}
                          >
                            Void
                          </button>
                          <button
                            type="button"
                            className="text-danger hover:underline"
                            onClick={() => setDeleting(p)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} limit={limit} total={total} onPage={setPage} />
      </div>

      <Modal
        open={recordOpen}
        title="Record payment"
        onClose={() => setRecordOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setRecordOpen(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={record} disabled={saving}>
              {saving ? "Saving…" : "Record"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <ErrorNote message={formError} />}
          <Field label="Student" htmlFor="pay_student">
            {pickedStudent ? (
              <div className="flex h-10 items-center justify-between rounded-md border border-line bg-tint px-3 text-sm">
                <span>
                  {pickedStudent.last_name}, {pickedStudent.first_name}{" "}
                  <span className="font-mono text-xs text-muted">{pickedStudent.student_no}</span>
                </span>
                <button
                  type="button"
                  className="text-danger hover:underline"
                  onClick={() => {
                    setPickedStudent(null);
                    setForm({ ...form, student_id: "" });
                    setStudentQuery("");
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  id="pay_student"
                  className={inputCls}
                  placeholder="Type name or student number…"
                  value={studentQuery}
                  onChange={(e) => {
                    setStudentQuery(e.target.value);
                    if (e.target.value.trim().length < 2) setStudentHits([]);
                  }}
                />
                {studentHits.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-line bg-surface">
                    {studentHits.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-sm hover:bg-tint"
                        onClick={() => {
                          setPickedStudent(s);
                          setForm({ ...form, student_id: String(s.id) });
                          setStudentHits([]);
                          setStudentQuery("");
                        }}
                      >
                        {s.last_name}, {s.first_name}{" "}
                        <span className="font-mono text-xs text-muted">{s.student_no}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₱)" htmlFor="pay_amount">
              <input
                id="pay_amount"
                type="number"
                min="0.01"
                step="0.01"
                className={inputCls}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </Field>
            <Field label="Payment date" htmlFor="pay_date">
              <input
                id="pay_date"
                type="date"
                className={inputCls}
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fee (optional)" htmlFor="pay_fee">
              <select
                id="pay_fee"
                className={inputCls}
                value={form.fee_id}
                onChange={(e) => {
                  const fee = fees.find((f) => String(f.id) === e.target.value);
                  setForm({
                    ...form,
                    fee_id: e.target.value,
                    amount: fee ? String(fee.amount) : form.amount,
                  });
                }}
              >
                <option value="">No fee (misc)</option>
                {fees.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} — {php(f.amount)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Mode" htmlFor="pay_mode">
              <select
                id="pay_mode"
                className={inputCls}
                value={form.mode}
                onChange={(e) => setForm({ ...form, mode: e.target.value })}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Academic year" htmlFor="pay_year">
              <input
                id="pay_year"
                className={inputCls}
                value={form.academic_year}
                onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
              />
            </Field>
            <Field label="Semester" htmlFor="pay_sem">
              <select
                id="pay_sem"
                className={inputCls}
                value={form.semester}
                onChange={(e) => setForm({ ...form, semester: e.target.value })}
              >
                <option value="">—</option>
                <option value="1st Semester">1st Semester</option>
                <option value="2nd Semester">2nd Semester</option>
                <option value="Summer">Summer</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reference no." htmlFor="pay_ref">
              <input
                id="pay_ref"
                className={inputCls}
                value={form.reference_no}
                onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
              />
            </Field>
            <Field label="Remarks" htmlFor="pay_remarks">
              <input
                id="pay_remarks"
                className={inputCls}
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={editRow !== null}
        title={editRow ? `Edit ${editRow.receipt_no}` : ""}
        onClose={() => setEditRow(null)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setEditRow(null)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={saveEdit} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₱)" htmlFor="edit_amount">
              <input
                id="edit_amount"
                type="number"
                min="0.01"
                step="0.01"
                className={inputCls}
                value={editForm.amount}
                onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              />
            </Field>
            <Field label="Payment date" htmlFor="edit_date">
              <input
                id="edit_date"
                type="date"
                className={inputCls}
                value={editForm.payment_date}
                onChange={(e) => setEditForm({ ...editForm, payment_date: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mode" htmlFor="edit_mode">
              <select
                id="edit_mode"
                className={inputCls}
                value={editForm.mode}
                onChange={(e) => setEditForm({ ...editForm, mode: e.target.value })}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m.replace("_", " ")}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Semester" htmlFor="edit_sem">
              <select
                id="edit_sem"
                className={inputCls}
                value={editForm.semester}
                onChange={(e) => setEditForm({ ...editForm, semester: e.target.value })}
              >
                <option value="">—</option>
                <option value="1st Semester">1st Semester</option>
                <option value="2nd Semester">2nd Semester</option>
                <option value="Summer">Summer</option>
              </select>
            </Field>
          </div>
          <Field label="Reference no." htmlFor="edit_ref">
            <input
              id="edit_ref"
              className={inputCls}
              value={editForm.reference_no}
              onChange={(e) => setEditForm({ ...editForm, reference_no: e.target.value })}
            />
          </Field>
          <Field label="Remarks" htmlFor="edit_remarks">
            <textarea
              id="edit_remarks"
              rows={2}
              className={inputCls}
              value={editForm.remarks}
              onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={voidRow !== null}
        title={voidRow ? `Void ${voidRow.receipt_no}` : ""}
        onClose={() => setVoidRow(null)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setVoidRow(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md border border-danger bg-danger-tint px-4 py-2 text-sm font-semibold text-danger disabled:opacity-60"
              onClick={voidPayment}
              disabled={busy}
            >
              {busy ? "Voiding…" : "Void payment"}
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm">
          The payment stays in the ledger with status <strong>void</strong> and no longer counts
          toward collections.
        </p>
        <Field label="Reason" htmlFor="void_reason">
          <input
            id="void_reason"
            className={inputCls}
            placeholder="Why is this payment being voided?"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={receiptOpen}
        title="Receipt"
        onClose={() => setReceiptOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setReceiptOpen(false)}>
              Close
            </button>
            <button type="button" className={btnPrimary} onClick={() => window.print()}>
              Print
            </button>
          </>
        }
      >
        {receipt && (
          <div className="space-y-2 rounded-lg border border-line p-4 text-sm">
            <div className="text-center">
              <div className="text-lg font-bold">{schoolName}</div>
              <div className="text-xs uppercase text-muted">Official Receipt</div>
            </div>
            <div className="flex justify-between border-t border-line pt-2">
              <span className="text-muted">Receipt No.</span>
              <span className="font-mono font-semibold">{receipt.receipt.receipt_no}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Date</span>
              <span>{receipt.receipt.payment_date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Student</span>
              <span>
                {(receipt.receipt.student as unknown as { last_name?: string; first_name?: string })
                  ?.last_name ?? ""},{" "}
                {(receipt.receipt.student as unknown as { first_name?: string })?.first_name ?? ""}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Fee</span>
              <span>{receipt.receipt.fee?.name ?? "Miscellaneous"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Mode</span>
              <span className="capitalize">{receipt.receipt.mode.replace("_", " ")}</span>
            </div>
            {receipt.receipt.reference_no && (
              <div className="flex justify-between">
                <span className="text-muted">Reference</span>
                <span className="font-mono text-xs">{receipt.receipt.reference_no}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
              <span>Amount</span>
              <span>{php(receipt.receipt.amount)}</span>
            </div>
            <div className="flex justify-between pt-4 text-xs text-muted">
              <span>Received by: {receipt.receipt.receipt_no ? "Treasury" : ""}</span>
              <span>Status: {receipt.receipt.status}</span>
            </div>
          </div>
        )}
      </Modal>

      <Confirm
        open={deleting !== null}
        title="Delete payment"
        message={
          deleting
            ? `Move ${deleting.receipt_no} (${php(deleting.amount)}) to Trash? It can be restored later.`
            : ""
        }
        confirmLabel="Move to Trash"
        danger
        busy={busy}
        onConfirm={deletePayment}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
