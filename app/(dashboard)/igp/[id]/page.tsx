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

interface Igp {
  id: number;
  name: string;
  description: string | null;
  category: { id: number; name: string } | null;
  custodian: string | null;
  is_active: boolean;
}

interface IncomeRow {
  id: number;
  description: string;
  amount: number;
  income_date: string;
  source: string;
}

interface Category {
  id: number;
  name: string;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function IgpDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { can } = useSession();
  const { push } = useToast();
  const canEdit = can("igpEditor");

  const [igp, setIgp] = useState<Igp | null>(null);
  const [recent, setRecent] = useState<IncomeRow[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category_id: "",
    custodian: "",
    is_active: true,
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ igp: Igp; recent_income: IncomeRow[]; total_income: number }>(
      `/api/igps/${id}`,
    );
    if (!res.ok) {
      setError("Project not found");
      setLoading(false);
      return;
    }
    setIgp(res.data.igp);
    setRecent(res.data.recent_income ?? []);
    setTotalIncome(res.data.total_income ?? 0);
    setError(null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api<{ items: Category[] }>("/api/categories?type=igp").then((res) => {
      if (cancelled) return;
      if (res.ok) setCategories(res.data.items ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function openEdit() {
    if (!igp) return;
    setForm({
      name: igp.name,
      description: igp.description ?? "",
      category_id: igp.category ? String(igp.category.id) : "",
      custodian: igp.custodian ?? "",
      is_active: igp.is_active,
    });
    setFormError(null);
    setEditOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    const res = await api(`/api/igps/${id}`, {
      method: "PATCH",
      json: {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category_id: form.category_id ? Number(form.category_id) : null,
        custodian: form.custodian.trim() || null,
        is_active: form.is_active,
      },
    });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setFormError(data.error ?? "Could not save project");
      return;
    }
    setEditOpen(false);
    push("success", "Project updated");
    load();
  }

  async function doDelete() {
    setBusy(true);
    const res = await api(`/api/igps/${id}`, { method: "DELETE" });
    setBusy(false);
    setConfirmDelete(false);
    if (res.ok) {
      push("success", "Project moved to Trash");
      router.push("/igp");
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not delete project");
    }
  }

  if (loading) return <Spinner />;
  if (error || !igp) return <ErrorNote message={error ?? "Project not found"} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/igp" className="text-sm text-primary hover:underline">
            ← Back to IGP / Income
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{igp.name}</h1>
          <p className="text-sm text-muted">
            {igp.category?.name ?? "No category"} · Custodian: {igp.custodian ?? "—"}
          </p>
          <div className="mt-2 flex gap-2">
            <Badge tone={igp.is_active ? "ok" : "neutral"}>
              {igp.is_active ? "Active" : "Inactive"}
            </Badge>
            <Badge tone="ok">{php(totalIncome)} total income</Badge>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button type="button" className={btnGhost} onClick={openEdit}>
              Edit
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

      {igp.description && <p className="text-sm text-ink">{igp.description}</p>}

      <div>
        <h2 className="mb-2 font-semibold">
          Recent income <span className="text-sm font-normal text-muted">(latest 50)</span>
        </h2>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState message="No income recorded for this project yet." />
                  </td>
                </tr>
              ) : (
                recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{r.income_date}</td>
                    <td className="px-3 py-2 font-semibold">{r.description}</td>
                    <td className="px-3 py-2 capitalize">{r.source}</td>
                    <td className="px-3 py-2 text-right font-semibold">{php(r.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={editOpen}
        title="Edit project"
        onClose={() => setEditOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setEditOpen(false)}>
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
          <Field label="Project name" htmlFor="ed_igp_name">
            <input
              id="ed_igp_name"
              className={inputCls}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor="ed_igp_cat">
              <select
                id="ed_igp_cat"
                className={inputCls}
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              >
                <option value="">None</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Custodian" htmlFor="ed_igp_cust">
              <input
                id="ed_igp_cust"
                className={inputCls}
                value={form.custodian}
                onChange={(e) => setForm({ ...form, custodian: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="ed_igp_desc">
            <textarea
              id="ed_igp_desc"
              rows={2}
              className={inputCls}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Active
          </label>
        </div>
      </Modal>

      <Confirm
        open={confirmDelete}
        title="Delete project"
        message={`Move "${igp.name}" to Trash?`}
        confirmLabel="Move to Trash"
        danger
        busy={busy}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
