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

interface Expense {
  id: number;
  description: string;
  amount: number;
  expense_date: string;
  category: { id: number; name: string; type: string } | null;
  voucher_no: string | null;
  payee: string | null;
  academic_year: string;
  semester: string | null;
  status: string;
}

interface Summary {
  count: number;
  total: number;
  by_status: Record<string, { count: number; total: number }>;
  by_category: { category: string; total: number }[];
}

interface Category {
  id: number;
  name: string;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  posted: "ok",
  draft: "warn",
  void: "danger",
};

function defaultAcademicYear() {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() + 1 >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  description: "",
  amount: "",
  expense_date: today(),
  category_id: "",
  voucher_no: "",
  payee: "",
  academic_year: defaultAcademicYear(),
  semester: "",
  status: "posted",
};

export default function ExpensesPage() {
  const { can } = useSession();
  const { push } = useToast();
  const canManage = can("expenseManager");

  const [rows, setRows] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catStats, setCatStats] = useState<{ total: number; active: number } | null>(null);
  const limit = 25;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (categoryId) params.set("category_id", categoryId);
    const res = await api<{ items: Expense[]; total: number }>(`/api/expenses?${params}`);
    if (res.ok) {
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setError(null);
    } else if (res.status !== 401) {
      setError("Could not load expenses");
    }
    setLoading(false);
    const sumParams = new URLSearchParams();
    if (from) sumParams.set("from", from);
    if (to) sumParams.set("to", to);
    const s = await api<Summary>(`/api/expenses/summary?${sumParams}`);
    if (s.ok) setSummary(s.data);
  }, [page, q, status, from, to, categoryId]);

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api<{ items: Category[] }>("/api/categories?type=expense").then((res) => {
      if (cancelled) return;
      if (res.ok) setCategories(res.data.items ?? []);
    });
    api<{ stats: Record<string, { total: number; active: number }> }>("/api/categories/stats").then(
      (res) => {
        if (cancelled) return;
        if (res.ok) setCatStats(res.data.stats?.expense ?? null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, expense_date: today(), academic_year: defaultAcademicYear() });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: Expense) {
    setEditing(row);
    setForm({
      description: row.description,
      amount: String(row.amount),
      expense_date: row.expense_date,
      category_id: row.category ? String(row.category.id) : "",
      voucher_no: row.voucher_no ?? "",
      payee: row.payee ?? "",
      academic_year: row.academic_year,
      semester: row.semester ?? "",
      status: row.status,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    const payload = {
      description: form.description.trim(),
      amount: Number(form.amount),
      expense_date: form.expense_date,
      category_id: form.category_id ? Number(form.category_id) : null,
      voucher_no: form.voucher_no.trim() || null,
      payee: form.payee.trim() || null,
      academic_year: form.academic_year.trim(),
      semester: form.semester || null,
      status: form.status,
    };
    const res = editing
      ? await api(`/api/expenses/${editing.id}`, { method: "PATCH", json: payload })
      : await api("/api/expenses", { method: "POST", json: payload });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setFormError(data.error ?? "Could not save expense");
      return;
    }
    setFormOpen(false);
    push("success", editing ? "Expense updated" : "Expense recorded");
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const res = await api(`/api/expenses/${deleting.id}`, { method: "DELETE" });
    setBusy(false);
    setDeleting(null);
    if (res.ok) {
      push("success", "Expense moved to Trash");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not delete expense");
    }
  }

  const topCategories = (summary?.by_category ?? []).slice(0, 2);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-sm text-muted">
            {total} expense records
            {catStats && (
              <>
                {" · "}
                {catStats.total} categories ({catStats.active} active)
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Link href="/api/expenses/export" className={btnGhost}>
              Export CSV
            </Link>
          )}
          {canManage && (
            <button type="button" className={btnPrimary} onClick={openCreate}>
              Record expense
            </button>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">Total spent</div>
            <div className="mt-1 text-lg font-bold">{php(summary.total)}</div>
            <div className="text-xs text-muted">{summary.count} entries</div>
          </div>
          {["posted", "draft"].map((st) => {
            const s = summary.by_status[st];
            return (
              <div key={st} className="rounded-lg border border-line bg-surface p-3">
                <div className="text-xs uppercase text-muted capitalize">{st}</div>
                <div className="mt-1 text-lg font-bold">{php(s?.total ?? 0)}</div>
                <div className="text-xs text-muted">{s?.count ?? 0} entries</div>
              </div>
            );
          })}
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">Top category</div>
            <div className="mt-1 truncate text-lg font-bold">
              {topCategories[0]?.category ?? "—"}
            </div>
            {topCategories[0] && (
              <div className="text-xs text-muted">{php(topCategories[0].total)}</div>
            )}
          </div>
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
          placeholder="Description, payee, voucher…"
          aria-label="Search expenses"
          className={`${inputCls} max-w-60`}
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
          <option value="draft">Draft</option>
          <option value="void">Void</option>
        </select>
        <select
          value={categoryId}
          onChange={(e) => {
            setPage(1);
            setCategoryId(e.target.value);
          }}
          aria-label="Category"
          className={`${inputCls} w-44`}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Payee</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Voucher</th>
              <th className="px-3 py-2">Amount</th>
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
                  <EmptyState message="No expenses match these filters." />
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-tint/40">
                  <td className="px-3 py-2">{r.expense_date}</td>
                  <td className="px-3 py-2 font-semibold">{r.description}</td>
                  <td className="px-3 py-2">{r.payee ?? "—"}</td>
                  <td className="px-3 py-2">{r.category?.name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.voucher_no ?? "—"}</td>
                  <td className="px-3 py-2 font-semibold">{php(r.amount)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canManage && (
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-danger hover:underline"
                          onClick={() => setDeleting(r)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
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
        title={editing ? "Edit expense" : "Record expense"}
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
          <Field label="Description" htmlFor="exp_desc">
            <input
              id="exp_desc"
              className={inputCls}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₱)" htmlFor="exp_amount">
              <input
                id="exp_amount"
                type="number"
                min="0"
                step="0.01"
                className={inputCls}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
              />
            </Field>
            <Field label="Date" htmlFor="exp_date">
              <input
                id="exp_date"
                type="date"
                className={inputCls}
                value={form.expense_date}
                onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="exp_cat">
              <select
                id="exp_cat"
                className={inputCls}
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payee" htmlFor="exp_payee">
              <input
                id="exp_payee"
                className={inputCls}
                value={form.payee}
                onChange={(e) => setForm({ ...form, payee: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Voucher no." htmlFor="exp_voucher">
              <input
                id="exp_voucher"
                className={inputCls}
                value={form.voucher_no}
                onChange={(e) => setForm({ ...form, voucher_no: e.target.value })}
              />
            </Field>
            <Field label="Status" htmlFor="exp_status">
              <select
                id="exp_status"
                className={inputCls}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option value="posted">Posted</option>
                <option value="draft">Draft</option>
                <option value="void">Void</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Academic year" htmlFor="exp_year">
              <input
                id="exp_year"
                className={inputCls}
                value={form.academic_year}
                onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
              />
            </Field>
            <Field label="Semester" htmlFor="exp_sem">
              <select
                id="exp_sem"
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
        </div>
      </Modal>

      <Confirm
        open={deleting !== null}
        title="Delete expense"
        message={
          deleting ? `Move "${deleting.description}" (${php(deleting.amount)}) to Trash?` : ""
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
