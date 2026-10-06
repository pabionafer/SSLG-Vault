"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  Spinner,
  btnGhost,
  btnPrimary,
  inputCls,
} from "@/components/ui";

interface Fee {
  id: string;
  name: string;
  category: { id: number; name: string } | null;
  amount: number;
  academic_year: string;
  semester: string;
  due_date: string | null;
  description: string | null;
  is_active: boolean;
}

interface FeeStats {
  students: number;
  expected: number;
  collected: number;
  outstanding: number;
  students_paid: number;
  students_unpaid: number;
  collection_rate: number;
}

interface TargetRow {
  id?: number;
  student_id: number | null;
  year_level: number | null;
}

interface Defaulter {
  student: { id: string | number; first_name: string; last_name: string; student_no: string };
  amount_due: number;
  amount_paid: number;
  balance: number;
  status: string;
  due_date: string;
  days_overdue: number;
}

interface Category {
  id: number;
  name: string;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FeeDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { can } = useSession();
  const { push } = useToast();
  const canManage = can("treasurer");

  const [fee, setFee] = useState<Fee | null>(null);
  const [stats, setStats] = useState<FeeStats | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [appliesAll, setAppliesAll] = useState(true);
  const [defaulters, setDefaulters] = useState<Defaulter[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category_id: "",
    amount: "",
    due_date: "",
    description: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [editTargets, setEditTargets] = useState(false);
  const [yearTargets, setYearTargets] = useState<number[]>([]);
  const [savingTargets, setSavingTargets] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [f, s, t, d] = await Promise.all([
      api<{ fee: Fee }>(`/api/fees/${id}`),
      api<{ stats: FeeStats }>(`/api/fees/${id}/stats`),
      api<{ targets: TargetRow[]; applies_to_all: boolean }>(`/api/fees/${id}/targets`),
      api<{ items: Defaulter[] }>(`/api/fees/${id}/defaulters`),
    ]);
    if (!f.ok) {
      setError("Fee not found");
      setLoading(false);
      return;
    }
    setFee(f.data.fee);
    setStats(s.data?.stats ?? null);
    setTargets(t.data?.targets ?? []);
    setAppliesAll(t.data?.applies_to_all ?? true);
    setDefaulters(d.data?.items ?? []);
    setError(null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api<{ items: Category[] }>("/api/categories?type=fee").then((res) => {
      if (cancelled) return;
      if (res.ok) setCategories(res.data.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function openEdit() {
    if (!fee) return;
    setForm({
      name: fee.name,
      category_id: fee.category ? String(fee.category.id) : "",
      amount: String(fee.amount),
      due_date: fee.due_date ?? "",
      description: fee.description ?? "",
      is_active: fee.is_active,
    });
    setFormError(null);
    setEditOpen(true);
  }

  async function saveFee() {
    setSaving(true);
    setFormError(null);
    const res = await api(`/api/fees/${id}`, {
      method: "PATCH",
      json: {
        name: form.name.trim(),
        category_id: form.category_id ? Number(form.category_id) : null,
        amount: Number(form.amount),
        due_date: form.due_date || null,
        description: form.description.trim() || null,
        is_active: form.is_active,
      },
    });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setFormError(data.error ?? "Could not save fee");
      return;
    }
    setEditOpen(false);
    push("success", "Fee updated");
    load();
  }

  function openTargetEditor() {
    const years = new Set<number>();
    for (const t of targets) if (t.year_level != null) years.add(t.year_level);
    setYearTargets([...years].sort((a, b) => a - b));
    setEditTargets(true);
  }

  async function saveTargets() {
    setSavingTargets(true);
    const studentTargets = targets
      .filter((t) => t.student_id != null)
      .map((t) => ({ student_id: t.student_id }));
    const payload = [
      ...yearTargets.map((y) => ({ year_level: y })),
      ...studentTargets,
    ];
    const res = await api(`/api/fees/${id}/targets`, {
      method: "PUT",
      json: { targets: payload },
    });
    setSavingTargets(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not save targets");
      return;
    }
    setEditTargets(false);
    push("success", "Target set updated");
    load();
  }

  async function doDelete() {
    setBusy(true);
    const res = await api(`/api/fees/${id}`, { method: "DELETE" });
    setBusy(false);
    setConfirmDelete(false);
    if (res.ok) {
      push("success", "Fee moved to Trash");
      router.push("/fees");
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not delete fee");
    }
  }

  if (loading) return <Spinner />;
  if (error || !fee) return <ErrorNote message={error ?? "Fee not found"} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/fees" className="text-sm text-primary hover:underline">
            ← Back to fees
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{fee.name}</h1>
          <p className="text-sm text-muted">
            {fee.semester} · {fee.academic_year} ·{" "}
            {fee.category ? fee.category.name : "No category"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={fee.is_active ? "ok" : "neutral"}>
              {fee.is_active ? "Active" : "Inactive"}
            </Badge>
            <Badge tone="neutral">{php(fee.amount)}</Badge>
            {fee.due_date && <Badge tone="warn">Due {fee.due_date}</Badge>}
            <Badge tone={appliesAll ? "ok" : "warn"}>
              {appliesAll
                ? "All students"
                : targets.length > 0
                  ? `${targets.length} target${targets.length === 1 ? "" : "s"}`
                  : "No targets"}
            </Badge>
          </div>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={openEdit}>
              Edit fee
            </button>
            <button
              type="button"
              className="rounded-md border border-danger bg-danger-tint px-4 py-2 text-sm font-semibold text-danger"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {fee.description && <p className="text-sm text-ink">{fee.description}</p>}

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Students", value: String(stats.students) },
            { label: "Expected", value: php(stats.expected) },
            { label: "Collected", value: php(stats.collected) },
            { label: "Outstanding", value: php(stats.outstanding) },
            { label: "Paid", value: `${stats.students_paid}` },
            { label: "Collection rate", value: `${stats.collection_rate}%` },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border border-line bg-surface p-3">
              <div className="text-xs uppercase text-muted">{c.label}</div>
              <div className="mt-1 text-lg font-bold">{c.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Target set</h2>
            <p className="text-xs text-muted">
              An empty set means the fee applies to every active student.
            </p>
          </div>
          {canManage && !editTargets && (
            <button type="button" className={btnGhost} onClick={openTargetEditor}>
              Edit targets
            </button>
          )}
        </div>
        {editTargets ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-4 text-sm">
              {[1, 2, 3, 4, 5, 6].map((y) => (
                <label key={y} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={yearTargets.includes(y)}
                    onChange={(e) =>
                      setYearTargets((prev) =>
                        e.target.checked
                          ? [...prev, y].sort((a, b) => a - b)
                          : prev.filter((n) => n !== y),
                      )
                    }
                  />
                  Year {y}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">
              Saving with no year levels selected and no individual students makes this fee apply
              to everyone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={btnGhost}
                onClick={() => setEditTargets(false)}
                disabled={savingTargets}
              >
                Cancel
              </button>
              <button
                type="button"
                className={btnPrimary}
                onClick={saveTargets}
                disabled={savingTargets}
              >
                {savingTargets ? "Saving…" : "Save targets"}
              </button>
            </div>
          </div>
        ) : appliesAll ? (
          <p className="text-sm">Applies to <strong>all students</strong>.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {targets.map((t, i) => (
              <Badge key={t.id ?? i} tone="warn">
                {t.year_level != null ? `Year ${t.year_level}` : `Student #${t.student_id}`}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 font-semibold">
          Overdue defaulters{" "}
          <span className="text-sm font-normal text-muted">
            ({defaulters.length} past due)
          </span>
        </h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Student No</th>
                <th className="px-3 py-2">Due date</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Paid</th>
                <th className="px-3 py-2">Balance</th>
                <th className="px-3 py-2">Days overdue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {defaulters.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message="No overdue balances for this fee." />
                  </td>
                </tr>
              ) : (
                defaulters.map((d, i) => (
                  <tr key={`${d.student.id}-${i}`}>
                    <td className="px-3 py-2 font-semibold">
                      {d.student.last_name}, {d.student.first_name}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{d.student.student_no}</td>
                    <td className="px-3 py-2">{d.due_date}</td>
                    <td className="px-3 py-2">{php(d.amount_due)}</td>
                    <td className="px-3 py-2">{php(d.amount_paid)}</td>
                    <td className="px-3 py-2 font-semibold">{php(d.balance)}</td>
                    <td className="px-3 py-2">
                      <Badge tone="danger">{d.days_overdue}d</Badge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={editOpen}
        title="Edit fee"
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setEditOpen(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={saveFee} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <ErrorNote message={formError} />}
          <Field label="Fee name" htmlFor="d_fee_name">
            <input
              id="d_fee_name"
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₱)" htmlFor="d_fee_amount">
              <input
                id="d_fee_amount"
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </Field>
            <Field label="Category" htmlFor="d_fee_cat">
              <select
                id="d_fee_cat"
                className={inputCls}
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date" htmlFor="d_fee_due">
              <input
                id="d_fee_due"
                type="date"
                className={inputCls}
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </Field>
            <Field label="Active" htmlFor="d_fee_active">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  id="d_fee_active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Charge this fee
              </label>
            </Field>
          </div>
          <Field label="Description" htmlFor="d_fee_desc">
            <textarea
              id="d_fee_desc"
              rows={2}
              className={inputCls}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      <Confirm
        open={confirmDelete}
        title="Delete fee"
        message={`Move "${fee.name}" to Trash? Existing payments keep their records.`}
        confirmLabel="Move to Trash"
        danger
        busy={busy}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
