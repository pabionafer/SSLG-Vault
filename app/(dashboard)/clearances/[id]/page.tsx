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
  Spinner,
  btnPrimary,
} from "@/components/ui";

interface Clearance {
  id: number;
  student_id: number;
  purpose: string;
  status: string;
  requested_at: string;
  remarks: string | null;
  academic_year: string | null;
  student: { id: number; student_no: string; first_name: string; last_name: string; year_level: number } | null;
}

interface ChecklistItem {
  id: number;
  label: string;
  kind: string;
  status: string;
  remarks: string | null;
  signed_by: string | null;
  signed_at: string | null;
}

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  pending: "warn",
  approved: "ok",
  rejected: "danger",
  released: "neutral",
};

const ITEM_TONE: Record<string, "ok" | "warn" | "neutral"> = {
  cleared: "ok",
  pending: "warn",
  not_applicable: "neutral",
};

export default function ClearanceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { can } = useSession();
  const { push } = useToast();
  const canManage = can("studentManager");

  const [clearance, setClearance] = useState<Clearance | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [blockers, setBlockers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{
      clearance: Clearance;
      items: ChecklistItem[];
      blockers: string[];
    }>(`/api/clearances/${id}`);
    if (!res.ok) {
      setError("Clearance not found");
      setLoading(false);
      return;
    }
    setClearance(res.data.clearance);
    setItems(res.data.items ?? []);
    setBlockers(res.data.blockers ?? []);
    setError(null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function signItem(item: ChecklistItem, status: "cleared" | "not_applicable") {
    setBusy(true);
    const res = await api(`/api/clearances/${id}`, {
      method: "PATCH",
      json: { items: [{ id: item.id, status }] },
    });
    setBusy(false);
    if (res.ok) {
      push("success", status === "cleared" ? "Item signed off" : "Marked not applicable");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not update item");
    }
  }

  async function runAction() {
    if (!action) return;
    setBusy(true);
    const res = await api(`/api/clearances/${id}/${action}`, { method: "POST", json: {} });
    setBusy(false);
    setAction(null);
    if (res.ok) {
      const past: Record<string, string> = {
        approve: "approved",
        reject: "rejected",
        release: "released",
      };
      push("success", `Clearance ${past[action] ?? action}`);
      load();
    } else {
      const data = res.data as { error?: string; blockers?: string[] };
      const list = data.blockers?.length ? ` — blocked by: ${data.blockers.join(", ")}` : "";
      push("error", `${data.error ?? "Action failed"}${list}`);
      load();
    }
  }

  async function doDelete() {
    setBusy(true);
    const res = await api(`/api/clearances/${id}`, { method: "DELETE" });
    setBusy(false);
    setConfirmDelete(false);
    if (res.ok) {
      push("success", "Clearance moved to Trash");
      router.push("/clearances");
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not delete clearance");
    }
  }

  if (loading) return <Spinner />;
  if (error || !clearance) return <ErrorNote message={error ?? "Clearance not found"} />;

  const clearedCount = items.filter((i) => i.status === "cleared").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/clearances" className="text-sm text-primary hover:underline">
            ← Back to clearances
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{clearance.purpose}</h1>
          <p className="text-sm text-muted">
            {clearance.student
              ? `${clearance.student.last_name}, ${clearance.student.first_name} · ${clearance.student.student_no} · Year ${clearance.student.year_level}`
              : `Student #${clearance.student_id}`}
            {" · "}Requested {new Date(clearance.requested_at).toLocaleDateString()}
          </p>
          <div className="mt-2 flex gap-2">
            <Badge tone={STATUS_TONE[clearance.status] ?? "neutral"}>{clearance.status}</Badge>
            <Badge tone={clearedCount === items.length ? "ok" : "warn"}>
              {clearedCount}/{items.length} checklist cleared
            </Badge>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {clearance.status === "pending" && (
              <>
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => setAction("approve")}
                  disabled={items.length > 0 && clearedCount < items.length}
                  title={
                    items.length > 0 && clearedCount < items.length
                      ? "Every fee item must be cleared first"
                      : undefined
                  }
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded-md border border-danger bg-danger-tint px-4 py-2 text-sm font-semibold text-danger"
                  onClick={() => setAction("reject")}
                >
                  Reject
                </button>
              </>
            )}
            {clearance.status === "approved" && (
              <button
                type="button"
                className={btnPrimary}
                onClick={() => setAction("release")}
              >
                Release
              </button>
            )}
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

      {blockers.length > 0 && clearance.status === "pending" && (
        <div className="rounded-lg border border-warn bg-warn-tint px-4 py-3 text-sm">
          <strong>Approve will fail until:</strong>
          <ul className="mt-1 list-inside list-disc">
            {blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {clearance.remarks && (
        <p className="text-sm text-muted">Remarks: {clearance.remarks}</p>
      )}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">Checklist item</th>
              <th className="px-3 py-2">Kind</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Remarks</th>
              <th className="px-3 py-2">Signed</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState message="No checklist items — this student has no assigned fees." />
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2 font-semibold">{item.label}</td>
                  <td className="px-3 py-2 capitalize">{item.kind}</td>
                  <td className="px-3 py-2">
                    <Badge tone={ITEM_TONE[item.status] ?? "neutral"}>{item.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{item.remarks ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {item.signed_by ? (
                      <>
                        {item.signed_by}
                        <div className="text-muted">
                          {item.signed_at ? new Date(item.signed_at).toLocaleDateString() : ""}
                        </div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canManage && item.status === "pending" && (
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          className="text-primary hover:underline disabled:opacity-50"
                          disabled={busy}
                          onClick={() => signItem(item, "cleared")}
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          className="text-muted hover:underline disabled:opacity-50"
                          disabled={busy}
                          onClick={() => signItem(item, "not_applicable")}
                        >
                          N/A
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Confirm
        open={action !== null}
        title={action ? `${action} clearance` : ""}
        message={
          action === "approve"
            ? "Approve this clearance? Every fee item must be cleared."
            : action
              ? `Are you sure you want to ${action} this clearance?`
              : ""
        }
        confirmLabel={action ? action.charAt(0).toUpperCase() + action.slice(1) : "Confirm"}
        danger={action === "reject"}
        busy={busy}
        onConfirm={runAction}
        onCancel={() => setAction(null)}
      />

      <Confirm
        open={confirmDelete}
        title="Delete clearance"
        message={`Move "${clearance.purpose}" to Trash?`}
        confirmLabel="Move to Trash"
        danger
        busy={busy}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
