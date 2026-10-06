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

interface Clearance {
  id: number;
  student_id: number;
  purpose: string;
  status: string;
  requested_at: string;
  remarks: string | null;
  student: {
    id: number;
    student_no: string;
    first_name: string;
    last_name: string;
    year_level: number;
  } | null;
}

interface StudentHit {
  id: number;
  student_no: string;
  first_name: string;
  last_name: string;
}

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  pending: "warn",
  approved: "ok",
  rejected: "danger",
  released: "neutral",
};

export default function ClearancesPage() {
  const { can } = useSession();
  const { push } = useToast();
  const canManage = can("studentManager");

  const [rows, setRows] = useState<Clearance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const limit = 25;

  const [openOpen, setOpenOpen] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [pickedStudent, setPickedStudent] = useState<StudentHit | null>(null);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentHits, setStudentHits] = useState<StudentHit[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [action, setAction] = useState<{ kind: string; row: Clearance } | null>(null);
  const [deleting, setDeleting] = useState<Clearance | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    const res = await api<{ items: Clearance[]; total: number }>(`/api/clearances?${params}`);
    if (res.ok) {
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setError(null);
    } else if (res.status !== 401) {
      setError("Could not load clearances");
    }
    setLoading(false);
  }, [page, q, status]);

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (studentQuery.trim().length < 2) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      api<{ items: StudentHit[] }>(
        `/api/students?limit=8&q=${encodeURIComponent(studentQuery.trim())}`,
      ).then((res) => {
        if (cancelled) return;
        setStudentHits(res.ok ? (res.data.items ?? []) : []);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [studentQuery]);

  function openForm() {
    setPurpose("");
    setPickedStudent(null);
    setStudentQuery("");
    setStudentHits([]);
    setFormError(null);
    setOpenOpen(true);
  }

  async function openClearance() {
    if (!pickedStudent) {
      setFormError("Pick a student first");
      return;
    }
    setSaving(true);
    setFormError(null);
    const res = await api("/api/clearances", {
      method: "POST",
      json: {
        student_id: pickedStudent.id,
        purpose: purpose.trim(),
        academic_year: new Date().getFullYear().toString(),
      },
    });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setFormError(data.error ?? "Could not open clearance");
      return;
    }
    setOpenOpen(false);
    push("success", "Clearance opened");
    load();
  }

  async function runAction() {
    if (!action) return;
    setBusy(true);
    const res = await api(`/api/clearances/${action.row.id}/${action.kind}`, {
      method: "POST",
      json: {},
    });
    setBusy(false);
    setAction(null);
    if (res.ok) {
      const past: Record<string, string> = {
        approve: "approved",
        reject: "rejected",
        release: "released",
      };
      push("success", `Clearance ${past[action.kind] ?? action.kind}`);
      load();
    } else {
      const data = res.data as { error?: string; blockers?: string[] };
      const blockers = data.blockers?.length ? ` — blocked by: ${data.blockers.join(", ")}` : "";
      push("error", `${data.error ?? "Action failed"}${blockers}`);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const res = await api(`/api/clearances/${deleting.id}`, { method: "DELETE" });
    setBusy(false);
    setDeleting(null);
    if (res.ok) {
      push("success", "Clearance moved to Trash");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not delete clearance");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clearances</h1>
          <p className="text-sm text-muted">{total} clearance requests</p>
        </div>
        {canManage && (
          <button type="button" className={btnPrimary} onClick={openForm}>
            Open clearance
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
          placeholder="Search purpose…"
          aria-label="Search clearances"
          className={`${inputCls} max-w-xs`}
        />
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          aria-label="Status"
          className={`${inputCls} w-40`}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="released">Released</option>
        </select>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Purpose</th>
              <th className="px-3 py-2">Requested</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={5}>
                  <Spinner />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <EmptyState message="No clearances match these filters." />
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="hover:bg-tint/40">
                  <td className="px-3 py-2">
                    <Link
                      href={`/clearances/${c.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {c.student
                        ? `${c.student.last_name}, ${c.student.first_name}`
                        : `#${c.student_id}`}
                    </Link>
                    <div className="text-xs text-muted">{c.student?.student_no ?? ""}</div>
                  </td>
                  <td className="px-3 py-2">{c.purpose}</td>
                  <td className="px-3 py-2">
                    {new Date(c.requested_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONE[c.status] ?? "neutral"}>{c.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <Link href={`/clearances/${c.id}`} className="text-primary hover:underline">
                        View
                      </Link>
                      {canManage && (
                        <>
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
                          <button
                            type="button"
                            className="text-danger hover:underline"
                            onClick={() => setDeleting(c)}
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
        open={openOpen}
        title="Open clearance"
        onClose={() => setOpenOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setOpenOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={openClearance}
              disabled={saving}
            >
              {saving ? "Opening…" : "Open"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <ErrorNote message={formError} />}
          <Field label="Student" htmlFor="clr_student">
            {pickedStudent ? (
              <div className="flex h-10 items-center justify-between rounded-md border border-line bg-tint px-3 text-sm">
                <span>
                  {pickedStudent.last_name}, {pickedStudent.first_name}{" "}
                  <span className="font-mono text-xs text-muted">{pickedStudent.student_no}</span>
                </span>
                <button
                  type="button"
                  className="text-danger hover:underline"
                  onClick={() => setPickedStudent(null)}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  id="clr_student"
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
          <Field label="Purpose" htmlFor="clr_purpose">
            <input
              id="clr_purpose"
              className={inputCls}
              placeholder="e.g. Enrolment, Transcript request…"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              required
            />
          </Field>
          <p className="text-xs text-muted">
            The fee checklist is built automatically from this student&apos;s live fee status.
          </p>
        </div>
      </Modal>

      <Confirm
        open={action !== null}
        title={action ? `${action.kind} clearance` : ""}
        message={
          action
            ? `Are you sure you want to ${action.kind} this clearance?${action.kind === "approve" ? " Approval only succeeds when every fee item is cleared." : ""}`
            : ""
        }
        confirmLabel={
          action ? action.kind.charAt(0).toUpperCase() + action.kind.slice(1) : "Confirm"
        }
        danger={action?.kind === "reject"}
        busy={busy}
        onConfirm={runAction}
        onCancel={() => setAction(null)}
      />

      <Confirm
        open={deleting !== null}
        title="Delete clearance"
        message={deleting ? `Move "${deleting.purpose}" to Trash?` : ""}
        confirmLabel="Move to Trash"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
