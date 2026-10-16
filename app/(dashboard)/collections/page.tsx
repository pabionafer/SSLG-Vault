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

interface Collection {
  id: number;
  collection_date: string;
  academic_year: string;
  semester: string;
  total_amount: number;
  notes: string | null;
  status: string;
  deactivated_at: string | null;
  prepared_by: string | null;
  created_at: string;
}

interface CollectionPayment {
  id: number;
  receipt_no: string;
  payment_date: string;
  amount: number;
  mode: string;
  status: string;
  student: { first_name: string; last_name: string } | null;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_TONE: Record<string, "ok" | "warn" | "neutral"> = {
  active: "ok",
  inactive: "warn",
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
  collection_date: today(),
  academic_year: defaultAcademicYear(),
  semester: "1st Semester",
  notes: "",
};

export default function CollectionsPage() {
  const { can } = useSession();
  const { push } = useToast();
  const canManage = can("treasurer");

  const [rows, setRows] = useState<Collection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [year, setYear] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const limit = 25;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Collection | null>(null);
  const [closing, setClosing] = useState<Collection | null>(null);
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState<{
    collection: Collection;
    payments: CollectionPayment[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (year) params.set("academic_year", year);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await api<{ items: Collection[]; total: number }>(
      `/api/collections?${params.toString()}`,
    );
    setLoading(false);
    if (res.ok) {
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setError(null);
    } else {
      const data = res.data as { error?: string };
      setError(data.error ?? "Could not load collections");
    }
  }, [page, q, status, year, from, to]);

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, collection_date: today(), academic_year: defaultAcademicYear() });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(row: Collection) {
    setEditing(row);
    setForm({
      collection_date: row.collection_date,
      academic_year: row.academic_year,
      semester: row.semester,
      notes: row.notes ?? "",
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    const payload = {
      collection_date: form.collection_date,
      academic_year: form.academic_year.trim(),
      semester: form.semester,
      notes: form.notes.trim() || null,
    };
    const res = editing
      ? await api(`/api/collections/${editing.id}`, {
          method: "PATCH",
          json: { collection_date: payload.collection_date, notes: payload.notes },
        })
      : await api("/api/collections", { method: "POST", json: payload });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setFormError(data.error ?? "Could not save collection");
      return;
    }
    setFormOpen(false);
    push("success", editing ? "Collection updated" : "Collection batch created");
    load();
  }

  async function confirmClose() {
    if (!closing) return;
    setBusy(true);
    const res = await api(`/api/collections/${closing.id}/close`, { method: "POST" });
    setBusy(false);
    setClosing(null);
    if (res.ok) {
      push("success", "Collection closed — purge clock started");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not close collection");
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const res = await api(`/api/collections/${deleting.id}`, { method: "DELETE" });
    setBusy(false);
    setDeleting(null);
    if (res.ok) {
      push("success", "Collection moved to Trash");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not delete collection");
    }
  }

  async function openDetail(row: Collection) {
    setDetailLoading(true);
    const res = await api<{ collection: Collection; payments: CollectionPayment[] }>(
      `/api/collections/${row.id}`,
    );
    setDetailLoading(false);
    if (res.ok) setDetail(res.data);
    else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not load collection");
    }
  }

  const activeCount = rows.filter((r) => r.status === "active").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Collections</h1>
          <p className="text-sm text-muted">
            {total} transmittal batches · {activeCount} active on this page
          </p>
        </div>
        {canManage && (
          <button type="button" className={btnPrimary} onClick={openCreate}>
            New batch
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
          placeholder="Search notes…"
          aria-label="Search collections"
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
          <option value="active">Active</option>
          <option value="inactive">Closed</option>
        </select>
        <input
          type="text"
          value={year}
          onChange={(e) => {
            setPage(1);
            setYear(e.target.value);
          }}
          placeholder="Academic year"
          aria-label="Academic year"
          className={`${inputCls} w-36`}
        />
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
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="No collections match these filters." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Academic year</th>
                <th className="px-3 py-2">Semester</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Notes</th>
                <th className="px-3 py-2">Prepared by</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2">{row.collection_date}</td>
                  <td className="px-3 py-2">{row.academic_year}</td>
                  <td className="px-3 py-2">{row.semester}</td>
                  <td className="px-3 py-2 font-medium">{php(Number(row.total_amount))}</td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONE[row.status] ?? "neutral"}>
                      {row.status === "inactive" ? "closed" : row.status}
                    </Badge>
                  </td>
                  <td className="max-w-48 truncate px-3 py-2 text-muted">{row.notes ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{row.prepared_by ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button type="button" className={btnGhost} onClick={() => openDetail(row)}>
                        View
                      </button>
                      {canManage && row.status === "active" && (
                        <>
                          <button type="button" className={btnGhost} onClick={() => openEdit(row)}>
                            Edit
                          </button>
                          <button type="button" className={btnGhost} onClick={() => setClosing(row)}>
                            Close
                          </button>
                          <button type="button" className={btnGhost} onClick={() => setDeleting(row)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} limit={limit} total={total} onPage={setPage} />

      <Modal
        open={formOpen}
        title={editing ? "Edit collection" : "New collection batch"}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : "Create"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <ErrorNote message={formError} />}
          <Field label="Collection date" htmlFor="col_date">
            <input
              id="col_date"
              type="date"
              value={form.collection_date}
              onChange={(e) => setForm({ ...form, collection_date: e.target.value })}
              className={inputCls}
              disabled={!!editing}
            />
          </Field>
          {!editing && (
            <>
              <Field label="Academic year" htmlFor="col_year">
                <input
                  id="col_year"
                  value={form.academic_year}
                  onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                  className={inputCls}
                  placeholder="2026-2027"
                />
              </Field>
              <Field label="Semester" htmlFor="col_sem">
                <select
                  id="col_sem"
                  value={form.semester}
                  onChange={(e) => setForm({ ...form, semester: e.target.value })}
                  className={inputCls}
                >
                  <option>1st Semester</option>
                  <option>2nd Semester</option>
                  <option>Summer</option>
                </select>
              </Field>
            </>
          )}
          <Field label="Notes" htmlFor="col_notes">
            <textarea
              id="col_notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputCls}
              rows={3}
              maxLength={500}
            />
          </Field>
        </div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Collection detail">
        {detailLoading || !detail ? (
          <Spinner />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-xs uppercase text-muted">Date</div>
                <div>{detail.collection.collection_date}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted">Period</div>
                <div>
                  {detail.collection.semester} {detail.collection.academic_year}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted">Status</div>
                <Badge tone={STATUS_TONE[detail.collection.status] ?? "neutral"}>
                  {detail.collection.status === "inactive" ? "closed" : detail.collection.status}
                </Badge>
              </div>
              <div>
                <div className="text-xs uppercase text-muted">Total</div>
                <div className="font-medium">{php(Number(detail.collection.total_amount))}</div>
              </div>
            </div>
            {detail.payments.length === 0 ? (
              <p className="text-sm text-muted">No payments in this batch yet.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase text-muted">
                      <th className="px-2 py-1">Receipt</th>
                      <th className="px-2 py-1">Date</th>
                      <th className="px-2 py-1">Student</th>
                      <th className="px-2 py-1 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.payments.map((p) => (
                      <tr key={p.id} className="border-b border-line last:border-0">
                        <td className="px-2 py-1">{p.receipt_no}</td>
                        <td className="px-2 py-1">{p.payment_date}</td>
                        <td className="px-2 py-1">
                          {p.student ? `${p.student.last_name}, ${p.student.first_name}` : "—"}
                        </td>
                        <td className="px-2 py-1 text-right">{php(Number(p.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex justify-end">
              <button type="button" className={btnGhost} onClick={() => setDetail(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Confirm
        open={closing !== null}
        title="Close collection?"
        message="Closing starts the 30-day purge clock. Payments can no longer be added to this batch."
        confirmLabel="Close batch"
        busy={busy}
        onConfirm={confirmClose}
        onCancel={() => setClosing(null)}
      />

      <Confirm
        open={deleting !== null}
        title="Delete collection?"
        message="The batch is soft-deleted and can be restored from Trash."
        confirmLabel="Move to Trash"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
