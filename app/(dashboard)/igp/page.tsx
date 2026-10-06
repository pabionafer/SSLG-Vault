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

interface Igp {
  id: number;
  name: string;
  description: string | null;
  category: { id: number; name: string } | null;
  custodian: string | null;
  is_active: boolean;
  total_income?: number;
  income_count?: number;
}

interface Income {
  id: number;
  description: string;
  amount: number;
  income_date: string;
  source: string;
  igp: { id: number; name: string } | null;
  category: { id: number; name: string } | null;
  reference_no: string | null;
  academic_year: string;
  semester: string | null;
}

interface Stats {
  total: number;
  active: number;
  total_income: number;
  top: { igp_id: number; name: string; total_income: number }[];
}

interface Category {
  id: number;
  name: string;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function defaultAcademicYear() {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() + 1 >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_IGP = { name: "", description: "", category_id: "", custodian: "", is_active: true };
const EMPTY_INCOME = {
  description: "",
  amount: "",
  income_date: today(),
  source: "other",
  igp_id: "",
  category_id: "",
  reference_no: "",
  academic_year: defaultAcademicYear(),
  semester: "",
};

export default function IgpPage() {
  const { can } = useSession();
  const { push } = useToast();
  const canEdit = can("igpEditor");
  const canExport = can("igpManager");

  const [tab, setTab] = useState<"projects" | "income">("projects");
  const [stats, setStats] = useState<Stats | null>(null);

  const [igps, setIgps] = useState<Igp[]>([]);
  const [igpTotal, setIgpTotal] = useState(0);
  const [igpPage, setIgpPage] = useState(1);
  const [igpQ, setIgpQ] = useState("");
  const [igpActive, setIgpActive] = useState("");
  const [igpLoading, setIgpLoading] = useState(true);
  const [igpError, setIgpError] = useState<string | null>(null);

  const [entries, setEntries] = useState<Income[]>([]);
  const [entryTotal, setEntryTotal] = useState(0);
  const [entryPage, setEntryPage] = useState(1);
  const [entryQ, setEntryQ] = useState("");
  const [source, setSource] = useState("");
  const [entryFrom, setEntryFrom] = useState("");
  const [entryTo, setEntryTo] = useState("");
  const [entryLoading, setEntryLoading] = useState(true);
  const [entryError, setEntryError] = useState<string | null>(null);
  const limit = 25;

  const [igpCategories, setIgpCategories] = useState<Category[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([]);
  const [allIgps, setAllIgps] = useState<Igp[]>([]);

  const [igpFormOpen, setIgpFormOpen] = useState(false);
  const [editingIgp, setEditingIgp] = useState<Igp | null>(null);
  const [igpForm, setIgpForm] = useState(EMPTY_IGP);
  const [savingIgp, setSavingIgp] = useState(false);
  const [igpFormError, setIgpFormError] = useState<string | null>(null);
  const [deletingIgp, setDeletingIgp] = useState<Igp | null>(null);

  const [incomeFormOpen, setIncomeFormOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [incomeForm, setIncomeForm] = useState(EMPTY_INCOME);
  const [savingIncome, setSavingIncome] = useState(false);
  const [incomeFormError, setIncomeFormError] = useState<string | null>(null);
  const [deletingIncome, setDeletingIncome] = useState<Income | null>(null);

  const [busy, setBusy] = useState(false);

  const loadIgps = useCallback(async () => {
    setIgpLoading(true);
    const params = new URLSearchParams({ page: String(igpPage), limit: String(limit) });
    if (igpQ.trim()) params.set("q", igpQ.trim());
    if (igpActive) params.set("is_active", igpActive);
    const res = await api<{ items: Igp[]; total: number }>(`/api/igps?${params}`);
    if (res.ok) {
      setIgps(res.data.items ?? []);
      setIgpTotal(res.data.total ?? 0);
      setIgpError(null);
    } else if (res.status !== 401) {
      setIgpError("Could not load IGP projects");
    }
    setIgpLoading(false);
  }, [igpPage, igpQ, igpActive]);

  const loadEntries = useCallback(async () => {
    setEntryLoading(true);
    const params = new URLSearchParams({ page: String(entryPage), limit: String(limit) });
    if (entryQ.trim()) params.set("q", entryQ.trim());
    if (source) params.set("source", source);
    if (entryFrom) params.set("from", entryFrom);
    if (entryTo) params.set("to", entryTo);
    const res = await api<{ items: Income[]; total: number }>(`/api/income?${params}`);
    if (res.ok) {
      setEntries(res.data.items ?? []);
      setEntryTotal(res.data.total ?? 0);
      setEntryError(null);
    } else if (res.status !== 401) {
      setEntryError("Could not load income entries");
    }
    setEntryLoading(false);
  }, [entryPage, entryQ, source, entryFrom, entryTo]);

  useEffect(() => {
    const t = window.setTimeout(loadIgps, 250);
    return () => window.clearTimeout(t);
  }, [loadIgps]);

  useEffect(() => {
    const t = window.setTimeout(loadEntries, 250);
    return () => window.clearTimeout(t);
  }, [loadEntries]);

  useEffect(() => {
    let cancelled = false;
    api<{ items: Category[] }>("/api/categories?type=igp").then((res) => {
      if (cancelled) return;
      if (res.ok) setIgpCategories(res.data.items ?? []);
    });
    api<{ items: Category[] }>("/api/categories?type=income").then((res) => {
      if (cancelled) return;
      if (res.ok) setIncomeCategories(res.data.items ?? []);
    });
    api<Stats>("/api/igps/stats").then((res) => {
      if (cancelled) return;
      if (res.ok) setStats(res.data);
    });
    api<{ items: Igp[] }>("/api/igps?limit=100").then((res) => {
      if (cancelled) return;
      if (res.ok) setAllIgps(res.data.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function openIgpCreate() {
    setEditingIgp(null);
    setIgpForm(EMPTY_IGP);
    setIgpFormError(null);
    setIgpFormOpen(true);
  }

  function openIgpEdit(row: Igp) {
    setEditingIgp(row);
    setIgpForm({
      name: row.name,
      description: row.description ?? "",
      category_id: row.category ? String(row.category.id) : "",
      custodian: row.custodian ?? "",
      is_active: row.is_active,
    });
    setIgpFormError(null);
    setIgpFormOpen(true);
  }

  async function saveIgp() {
    setSavingIgp(true);
    setIgpFormError(null);
    const payload = {
      name: igpForm.name.trim(),
      description: igpForm.description.trim() || null,
      category_id: igpForm.category_id ? Number(igpForm.category_id) : null,
      custodian: igpForm.custodian.trim() || null,
      is_active: igpForm.is_active,
    };
    const res = editingIgp
      ? await api(`/api/igps/${editingIgp.id}`, { method: "PATCH", json: payload })
      : await api("/api/igps", { method: "POST", json: payload });
    setSavingIgp(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setIgpFormError(data.error ?? "Could not save project");
      return;
    }
    setIgpFormOpen(false);
    push("success", editingIgp ? "Project updated" : "Project created");
    loadIgps();
  }

  async function confirmDeleteIgp() {
    if (!deletingIgp) return;
    setBusy(true);
    const res = await api(`/api/igps/${deletingIgp.id}`, { method: "DELETE" });
    setBusy(false);
    setDeletingIgp(null);
    if (res.ok) {
      push("success", "Project moved to Trash");
      loadIgps();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not delete project");
    }
  }

  function openIncomeCreate() {
    setEditingIncome(null);
    setIncomeForm({ ...EMPTY_INCOME, income_date: today(), academic_year: defaultAcademicYear() });
    setIncomeFormError(null);
    setIncomeFormOpen(true);
  }

  function openIncomeEdit(row: Income) {
    setEditingIncome(row);
    setIncomeForm({
      description: row.description,
      amount: String(row.amount),
      income_date: row.income_date,
      source: row.source,
      igp_id: row.igp ? String(row.igp.id) : "",
      category_id: row.category ? String(row.category.id) : "",
      reference_no: row.reference_no ?? "",
      academic_year: row.academic_year,
      semester: row.semester ?? "",
    });
    setIncomeFormError(null);
    setIncomeFormOpen(true);
  }

  async function saveIncome() {
    setSavingIncome(true);
    setIncomeFormError(null);
    const payload = {
      description: incomeForm.description.trim(),
      amount: Number(incomeForm.amount),
      income_date: incomeForm.income_date,
      source: incomeForm.source,
      igp_id: incomeForm.source === "igp" && incomeForm.igp_id ? Number(incomeForm.igp_id) : null,
      category_id: incomeForm.category_id ? Number(incomeForm.category_id) : null,
      reference_no: incomeForm.reference_no.trim() || null,
      academic_year: incomeForm.academic_year.trim(),
      semester: incomeForm.semester || null,
    };
    const res = editingIncome
      ? await api(`/api/income/${editingIncome.id}`, { method: "PATCH", json: payload })
      : await api("/api/income", { method: "POST", json: payload });
    setSavingIncome(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setIncomeFormError(data.error ?? "Could not save income entry");
      return;
    }
    setIncomeFormOpen(false);
    push("success", editingIncome ? "Income updated" : "Income recorded");
    loadEntries();
    loadIgps();
  }

  async function confirmDeleteIncome() {
    if (!deletingIncome) return;
    setBusy(true);
    const res = await api(`/api/income/${deletingIncome.id}`, { method: "DELETE" });
    setBusy(false);
    setDeletingIncome(null);
    if (res.ok) {
      push("success", "Income moved to Trash");
      loadEntries();
      loadIgps();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not delete income");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">IGP / Income</h1>
          <p className="text-sm text-muted">Income-generating projects and earnings ledger</p>
        </div>
        <div className="flex gap-2">
          {canEdit && tab === "projects" && (
            <button type="button" className={btnPrimary} onClick={openIgpCreate}>
              New project
            </button>
          )}
          {canEdit && tab === "income" && (
            <>
              {canExport && (
                <Link href="/api/income/export" className={btnGhost}>
                  Export CSV
                </Link>
              )}
              <button type="button" className={btnPrimary} onClick={openIncomeCreate}>
                Record income
              </button>
            </>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">Projects</div>
            <div className="mt-1 text-lg font-bold">{stats.total}</div>
            <div className="text-xs text-muted">{stats.active} active</div>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3 md:col-span-1 col-span-1">
            <div className="text-xs uppercase text-muted">Total IGP income</div>
            <div className="mt-1 text-lg font-bold">{php(stats.total_income)}</div>
          </div>
          <div className="col-span-2 rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">Top earner</div>
            <div className="mt-1 truncate text-lg font-bold">{stats.top[0]?.name ?? "—"}</div>
            {stats.top[0] && (
              <div className="text-xs text-muted">{php(stats.top[0].total_income)}</div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-line">
        {(
          [
            ["projects", "Projects"],
            ["income", "Income ledger"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${
              tab === key
                ? "border-primary text-primary"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "projects" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={igpQ}
              onChange={(e) => {
                setIgpPage(1);
                setIgpQ(e.target.value);
              }}
              placeholder="Search projects…"
              aria-label="Search projects"
              className={`${inputCls} max-w-xs`}
            />
            <select
              value={igpActive}
              onChange={(e) => {
                setIgpPage(1);
                setIgpActive(e.target.value);
              }}
              aria-label="Status"
              className={`${inputCls} w-36`}
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          {igpError && <ErrorNote message={igpError} />}

          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="px-3 py-2">Project</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Custodian</th>
                  <th className="px-3 py-2">Income</th>
                  <th className="px-3 py-2">Entries</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {igpLoading ? (
                  <tr>
                    <td colSpan={7}>
                      <Spinner />
                    </td>
                  </tr>
                ) : igps.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState message="No IGP projects found." />
                    </td>
                  </tr>
                ) : (
                  igps.map((row) => (
                    <tr key={row.id} className="hover:bg-tint/40">
                      <td className="px-3 py-2">
                        <Link
                          href={`/igp/${row.id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                        {row.description && (
                          <div className="truncate text-xs text-muted">{row.description}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">{row.category?.name ?? "—"}</td>
                      <td className="px-3 py-2">{row.custodian ?? "—"}</td>
                      <td className="px-3 py-2 font-semibold">{php(row.total_income ?? 0)}</td>
                      <td className="px-3 py-2">{row.income_count ?? 0}</td>
                      <td className="px-3 py-2">
                        <Badge tone={row.is_active ? "ok" : "neutral"}>
                          {row.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-2">
                          <Link href={`/igp/${row.id}`} className="text-primary hover:underline">
                            View
                          </Link>
                          {canEdit && (
                            <>
                              <button
                                type="button"
                                className="text-primary hover:underline"
                                onClick={() => openIgpEdit(row)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="text-danger hover:underline"
                                onClick={() => setDeletingIgp(row)}
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
            <Pagination page={igpPage} limit={limit} total={igpTotal} onPage={setIgpPage} />
          </div>
        </div>
      )}

      {tab === "income" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={entryQ}
              onChange={(e) => {
                setEntryPage(1);
                setEntryQ(e.target.value);
              }}
              placeholder="Description or reference…"
              aria-label="Search income"
              className={`${inputCls} max-w-60`}
            />
            <select
              value={source}
              onChange={(e) => {
                setEntryPage(1);
                setSource(e.target.value);
              }}
              aria-label="Source"
              className={`${inputCls} w-36`}
            >
              <option value="">All sources</option>
              <option value="igp">IGP</option>
              <option value="other">Other</option>
            </select>
            <input
              type="date"
              value={entryFrom}
              onChange={(e) => {
                setEntryPage(1);
                setEntryFrom(e.target.value);
              }}
              aria-label="From date"
              className={`${inputCls} w-40`}
            />
            <input
              type="date"
              value={entryTo}
              onChange={(e) => {
                setEntryPage(1);
                setEntryTo(e.target.value);
              }}
              aria-label="To date"
              className={`${inputCls} w-40`}
            />
          </div>

          {entryError && <ErrorNote message={entryError} />}

          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">IGP project</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">Amount</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {entryLoading ? (
                  <tr>
                    <td colSpan={7}>
                      <Spinner />
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState message="No income entries found." />
                    </td>
                  </tr>
                ) : (
                  entries.map((row) => (
                    <tr key={row.id} className="hover:bg-tint/40">
                      <td className="px-3 py-2">{row.income_date}</td>
                      <td className="px-3 py-2 font-semibold">{row.description}</td>
                      <td className="px-3 py-2">
                        <Badge tone={row.source === "igp" ? "ok" : "neutral"}>{row.source}</Badge>
                      </td>
                      <td className="px-3 py-2">{row.igp?.name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.reference_no ?? "—"}</td>
                      <td className="px-3 py-2 font-semibold">{php(row.amount)}</td>
                      <td className="px-3 py-2 text-right">
                        {canEdit && (
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              className="text-primary hover:underline"
                              onClick={() => openIncomeEdit(row)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-danger hover:underline"
                              onClick={() => setDeletingIncome(row)}
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
            <Pagination page={entryPage} limit={limit} total={entryTotal} onPage={setEntryPage} />
          </div>
        </div>
      )}

      <Modal
        open={igpFormOpen}
        title={editingIgp ? "Edit project" : "New IGP project"}
        onClose={() => setIgpFormOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setIgpFormOpen(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={saveIgp} disabled={savingIgp}>
              {savingIgp ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {igpFormError && <ErrorNote message={igpFormError} />}
          <Field label="Project name" htmlFor="igp_name">
            <input
              id="igp_name"
              className={inputCls}
              value={igpForm.name}
              onChange={(e) => setIgpForm({ ...igpForm, name: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="igp_cat">
              <select
                id="igp_cat"
                className={inputCls}
                value={igpForm.category_id}
                onChange={(e) => setIgpForm({ ...igpForm, category_id: e.target.value })}
              >
                <option value="">None</option>
                {igpCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Custodian" htmlFor="igp_custodian">
              <input
                id="igp_custodian"
                className={inputCls}
                value={igpForm.custodian}
                onChange={(e) => setIgpForm({ ...igpForm, custodian: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="igp_desc">
            <textarea
              id="igp_desc"
              rows={2}
              className={inputCls}
              value={igpForm.description}
              onChange={(e) => setIgpForm({ ...igpForm, description: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={igpForm.is_active}
              onChange={(e) => setIgpForm({ ...igpForm, is_active: e.target.checked })}
            />
            Active (currently earning)
          </label>
        </div>
      </Modal>

      <Modal
        open={incomeFormOpen}
        title={editingIncome ? "Edit income" : "Record income"}
        onClose={() => setIncomeFormOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setIncomeFormOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={saveIncome}
              disabled={savingIncome}
            >
              {savingIncome ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {incomeFormError && <ErrorNote message={incomeFormError} />}
          <Field label="Description" htmlFor="inc_desc">
            <input
              id="inc_desc"
              className={inputCls}
              value={incomeForm.description}
              onChange={(e) => setIncomeForm({ ...incomeForm, description: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₱)" htmlFor="inc_amount">
              <input
                id="inc_amount"
                type="number"
                min="0.01"
                step="0.01"
                className={inputCls}
                value={incomeForm.amount}
                onChange={(e) => setIncomeForm({ ...incomeForm, amount: e.target.value })}
                required
              />
            </Field>
            <Field label="Date" htmlFor="inc_date">
              <input
                id="inc_date"
                type="date"
                className={inputCls}
                value={incomeForm.income_date}
                onChange={(e) => setIncomeForm({ ...incomeForm, income_date: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Source" htmlFor="inc_source">
              <select
                id="inc_source"
                className={inputCls}
                value={incomeForm.source}
                onChange={(e) =>
                  setIncomeForm({ ...incomeForm, source: e.target.value, igp_id: "" })
                }
              >
                <option value="other">Other</option>
                <option value="igp">IGP project</option>
              </select>
            </Field>
            <Field label="IGP project" htmlFor="inc_igp">
              <select
                id="inc_igp"
                className={inputCls}
                value={incomeForm.igp_id}
                onChange={(e) => setIncomeForm({ ...incomeForm, igp_id: e.target.value })}
                disabled={incomeForm.source !== "igp"}
                required={incomeForm.source === "igp"}
              >
                <option value="">
                  {incomeForm.source === "igp" ? "— pick project —" : "Not IGP"}
                </option>
                {allIgps.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="inc_cat">
              <select
                id="inc_cat"
                className={inputCls}
                value={incomeForm.category_id}
                onChange={(e) => setIncomeForm({ ...incomeForm, category_id: e.target.value })}
              >
                <option value="">None</option>
                {incomeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reference no." htmlFor="inc_ref">
              <input
                id="inc_ref"
                className={inputCls}
                value={incomeForm.reference_no}
                onChange={(e) => setIncomeForm({ ...incomeForm, reference_no: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Academic year" htmlFor="inc_year">
              <input
                id="inc_year"
                className={inputCls}
                value={incomeForm.academic_year}
                onChange={(e) => setIncomeForm({ ...incomeForm, academic_year: e.target.value })}
              />
            </Field>
            <Field label="Semester" htmlFor="inc_sem">
              <select
                id="inc_sem"
                className={inputCls}
                value={incomeForm.semester}
                onChange={(e) => setIncomeForm({ ...incomeForm, semester: e.target.value })}
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
        open={deletingIgp !== null}
        title="Delete project"
        message={deletingIgp ? `Move "${deletingIgp.name}" to Trash?` : ""}
        confirmLabel="Move to Trash"
        danger
        busy={busy}
        onConfirm={confirmDeleteIgp}
        onCancel={() => setDeletingIgp(null)}
      />

      <Confirm
        open={deletingIncome !== null}
        title="Delete income entry"
        message={
          deletingIncome
            ? `Move "${deletingIncome.description}" (${php(deletingIncome.amount)}) to Trash?`
            : ""
        }
        confirmLabel="Move to Trash"
        danger
        busy={busy}
        onConfirm={confirmDeleteIncome}
        onCancel={() => setDeletingIncome(null)}
      />
    </div>
  );
}
