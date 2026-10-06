"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client/api";
import {
  Badge,
  EmptyState,
  ErrorNote,
  Pagination,
  Spinner,
  btnGhost,
  inputCls,
} from "@/components/ui";

interface AuditRow {
  id: number;
  created_at: string;
  username: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  details: unknown;
}

interface Stats {
  sampled: number;
  by_action: Record<string, number>;
  by_table: Record<string, number>;
  top_users: { username: string; count: number }[];
}

const ACTIONS = [
  "login",
  "logout",
  "create",
  "update",
  "delete",
  "restore",
  "purge",
  "import",
  "export",
  "approve",
  "reject",
  "void",
  "print",
  "download",
  "settings_update",
  "username_request",
  "role_change",
];

const actionTone = (a: string): "ok" | "warn" | "danger" | "neutral" => {
  if (a === "login" || a === "approve") return "ok";
  if (a === "delete" || a === "void" || a === "reject" || a === "purge") return "danger";
  if (a === "role_change" || a === "username_request" || a === "settings_update") return "warn";
  return "neutral";
};

function shortDetails(d: unknown): string {
  if (d == null) return "";
  try {
    const s = typeof d === "string" ? d : JSON.stringify(d);
    return s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return "";
  }
}

export default function ActivityLogPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState("");
  const [username, setUsername] = useState("");
  const [action, setAction] = useState("");
  const [table, setTable] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const limit = 50;

  const baseParams = useCallback(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (username.trim()) p.set("username", username.trim());
    if (action) p.set("action", action);
    if (table.trim()) p.set("target_table", table.trim());
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p;
  }, [q, username, action, table, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = baseParams();
    p.set("page", String(page));
    p.set("limit", String(limit));
    const res = await api<{ items: AuditRow[]; total: number }>(`/api/audit-log?${p}`);
    if (res.ok) {
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setError(null);
    } else if (res.status !== 401) {
      setError("Could not load the audit log");
    }
    setLoading(false);
  }, [baseParams, page]);

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api<Stats>("/api/audit-log/stats").then((res) => {
      if (cancelled) return;
      if (res.ok) setStats(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const exportHref = `/api/audit-log/export?${baseParams()}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Activity Log</h1>
          <p className="text-sm text-muted">
            {total} entries{stats ? ` · last ${stats.sampled} sampled for stats` : ""}
          </p>
        </div>
        <Link href={exportHref} className={btnGhost}>
          Export CSV
        </Link>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-line bg-surface p-3">
            <div className="text-xs uppercase text-muted">Top user</div>
            <div className="mt-1 truncate text-lg font-bold">
              {stats.top_users[0]?.username ?? "—"}
            </div>
            <div className="text-xs text-muted">
              {stats.top_users[0] ? `${stats.top_users[0].count} actions` : ""}
            </div>
          </div>
          <div className="col-span-1 rounded-lg border border-line bg-surface p-3 md:col-span-3">
            <div className="text-xs uppercase text-muted">Actions</div>
            <div className="mt-1 flex flex-wrap gap-1 text-xs">
              {Object.entries(stats.by_action)
                .sort((a, b) => b[1] - a[1])
                .map(([a, n]) => (
                  <span key={a} className="rounded bg-tint px-1.5 py-0.5">
                    {a}: {n}
                  </span>
                ))}
            </div>
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
          placeholder="Search target or details…"
          aria-label="Search audit log"
          className={`${inputCls} max-w-56`}
        />
        <input
          type="text"
          value={username}
          onChange={(e) => {
            setPage(1);
            setUsername(e.target.value);
          }}
          placeholder="Username"
          aria-label="Username"
          className={`${inputCls} w-36`}
        />
        <select
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
          aria-label="Action"
          className={`${inputCls} w-44`}
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={table}
          onChange={(e) => {
            setPage(1);
            setTable(e.target.value);
          }}
          placeholder="Table (e.g. payments)"
          aria-label="Target table"
          className={`${inputCls} w-44`}
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

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Details</th>
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
                  <EmptyState message="No audit entries match these filters." />
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-tint/40">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.username ?? "(system)"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={actionTone(r.action)}>{r.action}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.target_table ?? "—"}
                    {r.target_id ? ` #${r.target_id}` : ""}
                  </td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs text-muted">
                    {shortDetails(r.details)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} limit={limit} total={total} onPage={setPage} />
      </div>
    </div>
  );
}
