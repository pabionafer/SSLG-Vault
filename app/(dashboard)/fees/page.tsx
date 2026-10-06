"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

interface Category {
  id: number;
  name: string;
}

interface FeeForm {
  name: string;
  category_id: string;
  amount: string;
  academic_year: string;
  semester: string;
  due_date: string;
  description: string;
  is_active: boolean;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EMPTY_FORM: FeeForm = {
  name: "",
  category_id: "",
  amount: "",
  academic_year: new Date().getFullYear() + "-" + (new Date().getFullYear() + 1),
  semester: "1st Semester",
  due_date: "",
  description: "",
  is_active: true,
};

export default function FeesPage() {
  const { can } = useSession();
  const { push } = useToast();
  const canManage = can("treasurer");

  const [rows, setRows] = useState<Fee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [year, setYear] = useState("");
  const [semester, setSemester] = useState("");
  const [activeOnly, setActiveOnly] = useState("");
  const limit = 25;

  const [categories, setCategories] = useState<Category[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Fee | null>(null);
  const [form, setForm] = useState<FeeForm>(EMPTY_FORM);
  const [targetMode, setTargetMode] = useState<"all" | "years">("all");
  const [targetYears, setTargetYears] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Fee | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q.trim()) params.set("q", q.trim());
    if (year) params.set("academic_year", year.trim());
    if (semester) params.set("semester", semester);
    if (activeOnly) params.set("is_active", activeOnly);
    const res = await api<{ items: Fee[]; total: number }>(`/api/fees?${params}`);
    if (res.ok) {
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setError(null);
    } else if (res.status !== 401) {
      setError("Could not load fees");
    }
    setLoading(false);
  }, [page, q, year, semester, activeOnly]);

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
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

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setTargetMode("all");
    setTargetYears([]);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(fee: Fee) {
    setEditing(fee);
    setForm({
      name: fee.name,
      category_id: fee.category ? String(fee.category.id) : "",
      amount: String(fee.amount),
      academic_year: fee.academic_year,
      semester: fee.semester,
      due_date: fee.due_date ?? "",
      description: fee.description ?? "",
      is_active: fee.is_active,
    });
    setTargetMode("all");
    setTargetYears([]);
    setFormError(null);
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    const base = {
      name: form.name.trim(),
      category_id: form.category_id ? Number(form.category_id) : null,
      amount: Number(form.amount),
      due_date: form.due_date || null,
      description: form.description.trim() || null,
      is_active: form.is_active,
    };
    const res = editing
      ? await api(`/api/fees/${editing.id}`, { method: "PATCH", json: base })
      : await api("/api/fees", {
          method: "POST",
          json: {
            ...base,
            academic_year: form.academic_year.trim(),
            semester: form.semester,
            targets:
              targetMode === "years"
                ? targetYears.map((y) => ({ year_level: y }))
                : [],
          },
        });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setFormError(data.error ?? "Could not save fee");
      return;
    }
    setFormOpen(false);
    push("success", editing ? "Fee updated" : "Fee created");
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const res = await api(`/api/fees/${deleting.id}`, { method: "DELETE" });
    setBusy(false);
    setDeleting(null);
    if (res.ok) {
      push("success", "Fee moved to Trash");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not delete fee");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fees</h1>
          <p className="text-sm text-muted">{total} fee definitions</p>
        </div>
        {canManage && (
          <button type="button" className={btnPrimary} onClick={openCreate}>
            Add fee
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="Search fee name…"
          aria-label="Search fees"
          className={`${inputCls} max-w-xs`}
        />
        <input
          type="text"
          value={year}
          onChange={(e) => {
            setPage(1);
            setYear(e.target.value);
          }}
          placeholder="Academic year (e.g. 2025-2026)"
          aria-label="Academic year"
          className={`${inputCls} w-56`}
        />
        <select
          value={semester}
          onChange={(e) => {
            setPage(1);
            setSemester(e.target.value);
          }}
          aria-label="Semester"
          className={`${inputCls} w-44`}
        >
          <option value="">All semesters</option>
          <option value="1st Semester">1st Semester</option>
          <option value="2nd Semester">2nd Semester</option>
          <option value="Summer">Summer</option>
        </select>
        <select
          value={activeOnly}
          onChange={(e) => {
            setPage(1);
            setActiveOnly(e.target.value);
          }}
          aria-label="Status"
          className={`${inputCls} w-36`}
        >
          <option value="">All</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">Fee</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Period</th>
              <th className="px-3 py-2">Due</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={7}>
                  <Spinner />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <EmptyState message="No fees match these filters." />
                </td>
              </tr>
            ) : (
              rows.map((f) => (
                <tr key={f.id} className="hover:bg-tint/40">
                  <td className="px-3 py-2">
                    <Link
                      href={`/fees/${f.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {f.name}
                    </Link>
                    {f.description && (
                      <div className="truncate text-xs text-muted">{f.description}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">{f.category?.name ?? "—"}</td>
                  <td className="px-3 py-2">{php(f.amount)}</td>
                  <td className="px-3 py-2">
                    {f.semester}
                    <div className="text-xs text-muted">{f.academic_year}</div>
                  </td>
                  <td className="px-3 py-2">{f.due_date ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={f.is_active ? "ok" : "neutral"}>
                      {f.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <Link href={`/fees/${f.id}`} className="text-primary hover:underline">
                        View
                      </Link>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => openEdit(f)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-danger hover:underline"
                            onClick={() => setDeleting(f)}
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
        open={formOpen}
        title={editing ? "Edit fee" : "Create fee"}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <ErrorNote message={formError} />}
          <Field label="Fee name" htmlFor="fee_name">
            <input
              id="fee_name"
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₱)" htmlFor="fee_amount">
              <input
                id="fee_amount"
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </Field>
            <Field label="Category" htmlFor="fee_category">
              <select
                id="fee_category"
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
          {!editing && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Academic year" htmlFor="fee_year">
                <input
                  id="fee_year"
                  className={inputCls}
                  value={form.academic_year}
                  onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                  required
                />
              </Field>
              <Field label="Semester" htmlFor="fee_sem">
                <select
                  id="fee_sem"
                  className={inputCls}
                  value={form.semester}
                  onChange={(e) => setForm({ ...form, semester: e.target.value })}
                >
                  <option value="1st Semester">1st Semester</option>
                  <option value="2nd Semester">2nd Semester</option>
                  <option value="Summer">Summer</option>
                </select>
              </Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due date" htmlFor="fee_due">
              <input
                id="fee_due"
                type="date"
                className={inputCls}
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </Field>
            <Field label="Active" htmlFor="fee_active">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  id="fee_active"
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="h-4 w-4 accent-[var(--color-primary,#1f6f43)]"
                />
                Charge this fee
              </label>
            </Field>
          </div>
          <Field label="Description" htmlFor="fee_desc">
            <textarea
              id="fee_desc"
              rows={2}
              className={inputCls}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          {!editing && (
            <div className="rounded-lg border border-line p-3">
              <div className="mb-2 text-sm font-semibold">Applies to</div>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="target_mode"
                    checked={targetMode === "all"}
                    onChange={() => setTargetMode("all")}
                  />
                  Every student
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="target_mode"
                    checked={targetMode === "years"}
                    onChange={() => setTargetMode("years")}
                  />
                  Specific year levels
                </label>
              </div>
              {targetMode === "years" && (
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {[1, 2, 3, 4, 5, 6].map((y) => (
                    <label key={y} className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={targetYears.includes(y)}
                        onChange={(e) =>
                          setTargetYears((prev) =>
                            e.target.checked
                              ? [...prev, y].sort((a, b) => a - b)
                              : prev.filter((n) => n !== y),
                          )
                        }
                      />
                      Year {y}
                    </label>
                  ))}
                  {targetMode === "years" && targetYears.length === 0 && (
                    <p className="text-xs text-warn">
                      None selected yet — save would apply to everyone.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      <Confirm
        open={deleting !== null}
        title="Delete fee"
        message={
          deleting
            ? `Move "${deleting.name}" to Trash? Existing payments keep their records.`
            : ""
        }
        confirmLabel="Move to Trash"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
