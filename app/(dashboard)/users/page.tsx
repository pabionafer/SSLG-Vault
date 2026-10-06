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

interface UserRow {
  id: string;
  username: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  bio: string | null;
  pending_username: string | null;
  username_requested_at: string | null;
}

const ROLES = ["admin", "treasurer", "president", "officer", "adviser"] as const;

const ROLE_TONE: Record<string, "ok" | "warn" | "neutral"> = {
  admin: "warn",
  treasurer: "ok",
  president: "ok",
  officer: "neutral",
  adviser: "neutral",
};

export default function UsersPage() {
  const { profile: me, refresh } = useSession();
  const { push } = useToast();

  const [rows, setRows] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [activeOnly, setActiveOnly] = useState("");
  const limit = 25;

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    username: "",
    full_name: "",
    role: "officer",
  });
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", role: "officer", is_active: true });
  const [pwRow, setPwRow] = useState<UserRow | null>(null);
  const [pw, setPw] = useState("");
  const [deactivating, setDeactivating] = useState<UserRow | null>(null);
  const [auditRow, setAuditRow] = useState<UserRow | null>(null);
  const [auditItems, setAuditItems] = useState<Record<string, unknown>[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q.trim()) params.set("q", q.trim());
    if (role) params.set("role", role);
    if (activeOnly) params.set("is_active", activeOnly);
    const res = await api<{ items: UserRow[]; total: number }>(`/api/users?${params}`);
    if (res.ok) {
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setError(null);
    } else if (res.status !== 401) {
      setError("Could not load users");
    }
    setLoading(false);
  }, [page, q, role, activeOnly]);

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  function openCreate() {
    setCreateForm({ email: "", password: "", username: "", full_name: "", role: "officer" });
    setFormError(null);
    setCreateOpen(true);
  }

  async function createUser() {
    setSaving(true);
    setFormError(null);
    const res = await api("/api/users", {
      method: "POST",
      json: {
        email: createForm.email.trim(),
        password: createForm.password,
        username: createForm.username.trim(),
        full_name: createForm.full_name.trim(),
        role: createForm.role,
      },
    });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setFormError(data.error ?? "Could not create user");
      return;
    }
    setCreateOpen(false);
    push("success", "User created");
    load();
  }

  function openEdit(row: UserRow) {
    setEditing(row);
    setEditForm({
      full_name: row.full_name ?? "",
      role: row.role,
      is_active: row.is_active,
    });
    setFormError(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    setFormError(null);
    const res = await api(`/api/users/${editing.id}`, {
      method: "PATCH",
      json: {
        full_name: editForm.full_name.trim(),
        role: editForm.role,
        is_active: editForm.is_active,
        approve_username: Boolean(editing.pending_username),
      },
    });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setFormError(data.error ?? "Could not update user");
      return;
    }
    setEditing(null);
    push("success", "User updated");
    if (editing.pending_username) push("info", "Pending username approved");
    if (editing.id === me?.id) refresh();
    load();
  }

  async function resetPassword() {
    if (!pwRow) return;
    setSaving(true);
    setFormError(null);
    const res = await api(`/api/users/${pwRow.id}/password`, {
      method: "POST",
      json: { password: pw },
    });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setFormError(data.error ?? "Could not reset password");
      return;
    }
    setPwRow(null);
    setPw("");
    push("success", "Password reset");
  }

  async function deactivate() {
    if (!deactivating) return;
    setBusy(true);
    const res = await api(`/api/users/${deactivating.id}`, { method: "DELETE" });
    setBusy(false);
    setDeactivating(null);
    if (res.ok) {
      push("success", "Account deactivated");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not deactivate");
    }
  }

  async function openAudit(row: UserRow) {
    setAuditRow(row);
    setAuditItems([]);
    setAuditLoading(true);
    const res = await api<{ items: Record<string, unknown>[] }>(
      `/api/users/${row.id}/audit?limit=50`,
    );
    setAuditLoading(false);
    if (res.ok) setAuditItems(res.data.items ?? []);
    else push("error", "Could not load audit trail");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted">{total} accounts</p>
        </div>
        <button type="button" className={btnPrimary} onClick={openCreate}>
          Add user
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="Search username or name…"
          aria-label="Search users"
          className={`${inputCls} max-w-xs`}
        />
        <select
          value={role}
          onChange={(e) => {
            setPage(1);
            setRole(e.target.value);
          }}
          aria-label="Role"
          className={`${inputCls} w-40`}
        >
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
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
              <th className="px-3 py-2">Username</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Role</th>
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
                  <EmptyState message="No users match these filters." />
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="hover:bg-tint/40">
                  <td className="px-3 py-2">
                    <span className="font-mono text-sm font-semibold">{u.username}</span>
                    {u.id === me?.id && (
                      <span className="ml-2 text-xs text-muted">(you)</span>
                    )}
                    {u.pending_username && (
                      <div className="text-xs text-warn">
                        requested: {u.pending_username}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">{u.full_name ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={ROLE_TONE[u.role] ?? "neutral"}>{u.role}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={u.is_active ? "ok" : "danger"}>
                      {u.is_active ? "active" : "inactive"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => openEdit(u)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => {
                          setPwRow(u);
                          setPw("");
                          setFormError(null);
                        }}
                      >
                        Reset PW
                      </button>
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => openAudit(u)}
                      >
                        Audit
                      </button>
                      {u.is_active && u.id !== me?.id && (
                        <button
                          type="button"
                          className="text-danger hover:underline"
                          onClick={() => setDeactivating(u)}
                        >
                          Deactivate
                        </button>
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
        open={createOpen}
        title="Add user"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={createUser} disabled={saving}>
              {saving ? "Creating…" : "Create"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <ErrorNote message={formError} />}
          <Field label="Full name" htmlFor="u_full">
            <input
              id="u_full"
              className={inputCls}
              value={createForm.full_name}
              onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username" htmlFor="u_username">
              <input
                id="u_username"
                className={inputCls}
                value={createForm.username}
                onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                required
              />
            </Field>
            <Field label="Role" htmlFor="u_role">
              <select
                id="u_role"
                className={inputCls}
                value={createForm.role}
                onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Email" htmlFor="u_email">
            <input
              id="u_email"
              type="email"
              className={inputCls}
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
              required
            />
          </Field>
          <Field label="Password" htmlFor="u_pw">
            <input
              id="u_pw"
              type="password"
              className={inputCls}
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              required
            />
            <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
          </Field>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        title={editing ? `Edit ${editing.username}` : ""}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={saveEdit} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <ErrorNote message={formError} />}
          {editing?.pending_username && (
            <div className="rounded-lg border border-warn bg-warn-tint px-3 py-2 text-sm">
              This user requested the username <strong>{editing.pending_username}</strong>.
              Saving approves it.
            </div>
          )}
          <Field label="Full name" htmlFor="eu_full">
            <input
              id="eu_full"
              className={inputCls}
              value={editForm.full_name}
              onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role" htmlFor="eu_role">
              <select
                id="eu_role"
                className={inputCls}
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status" htmlFor="eu_active">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  id="eu_active"
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                />
                Account active
              </label>
            </Field>
          </div>
        </div>
      </Modal>

      <Modal
        open={pwRow !== null}
        title={pwRow ? `Reset password — ${pwRow.username}` : ""}
        onClose={() => setPwRow(null)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setPwRow(null)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={resetPassword} disabled={saving}>
              {saving ? "Resetting…" : "Reset password"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <ErrorNote message={formError} />}
          <Field label="New password" htmlFor="new_pw">
            <input
              id="new_pw"
              type="password"
              className={inputCls}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
            />
            <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
          </Field>
        </div>
      </Modal>

      <Modal
        open={auditRow !== null}
        title={auditRow ? `Audit trail — ${auditRow.username}` : ""}
        onClose={() => setAuditRow(null)}
        footer={
          <button type="button" className={btnGhost} onClick={() => setAuditRow(null)}>
            Close
          </button>
        }
      >
        {auditLoading ? (
          <Spinner />
        ) : auditItems.length === 0 ? (
          <EmptyState message="No audit entries for this user." />
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto text-sm">
            {auditItems.map((a, i) => (
              <div key={i} className="rounded-md border border-line px-3 py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-semibold">{String(a.action)}</span>
                  <span className="text-xs text-muted">
                    {a.created_at ? new Date(String(a.created_at)).toLocaleString() : ""}
                  </span>
                </div>
                <div className="text-xs text-muted">
                  {String(a.target_table ?? "")} {String(a.target_id ?? "")}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Confirm
        open={deactivating !== null}
        title="Deactivate account"
        message={
          deactivating
            ? `${deactivating.username} will no longer be able to sign in. This is reversible (reactivate via Edit).`
            : ""
        }
        confirmLabel="Deactivate"
        danger
        busy={busy}
        onConfirm={deactivate}
        onCancel={() => setDeactivating(null)}
      />
    </div>
  );
}
