"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useToast } from "@/lib/client/toast";
import { api } from "@/lib/client/api";
import {
  Badge,
  EmptyState,
  ErrorNote,
  Modal,
  Spinner,
  btnGhost,
} from "@/components/ui";

interface LiveRow {
  academic_year: string;
  total_income: number;
  total_expenses: number;
  balance: number;
}

interface Snapshot {
  id: number;
  academic_year: string;
  total_income: number;
  total_expenses: number;
  balance: number;
  computed_at: string;
  prepared_by: string;
}

interface YearDetail {
  live: LiveRow;
  snapshot: Snapshot | null;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function YearlyBalancePage() {
  const { push } = useToast();

  const [rows, setRows] = useState<LiveRow[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ year: string; data: YearDetail } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<{ items: LiveRow[]; snapshots: Snapshot[] }>("/api/yearly-balance");
    if (res.ok) {
      setRows(res.data.items ?? []);
      setSnapshots(res.data.snapshots ?? []);
      setError(null);
    } else if (res.status !== 401) {
      setError("Could not load yearly balances");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  async function saveSnapshot(year: string) {
    setSaving(year);
    const res = await api("/api/yearly-balance", {
      method: "POST",
      json: { academic_year: year },
    });
    setSaving(null);
    if (res.ok) {
      push("success", `Snapshot saved for ${year}`);
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not save snapshot");
    }
  }

  async function openDetail(year: string) {
    setDetailLoading(true);
    const res = await api<YearDetail>(`/api/yearly-balance/${encodeURIComponent(year)}`);
    setDetailLoading(false);
    if (res.ok) setDetail({ year, data: res.data });
    else push("error", "Could not load year detail");
  }

  const snapshotByYear = new Map(snapshots.map((s) => [s.academic_year, s]));
  const years = new Set<string>([
    ...rows.map((r) => r.academic_year),
    ...snapshots.map((s) => s.academic_year),
  ]);
  const ordered = [...years].sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Yearly Balance</h1>
          <p className="text-sm text-muted">
            Live income vs expenses by academic year, with freeze-able snapshots
          </p>
        </div>
        <Link href="/api/yearly-balance/export" className={btnGhost}>
          Export CSV
        </Link>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">Academic year</th>
              <th className="px-3 py-2 text-right">Income</th>
              <th className="px-3 py-2 text-right">Expenses</th>
              <th className="px-3 py-2 text-right">Balance</th>
              <th className="px-3 py-2">Snapshot</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={6}>
                  <Spinner />
                </td>
              </tr>
            ) : ordered.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState message="No ledger activity yet." />
                </td>
              </tr>
            ) : (
              ordered.map((year) => {
                const live = rows.find((r) => r.academic_year === year);
                const snap = snapshotByYear.get(year);
                return (
                  <tr key={year} className="hover:bg-tint/40">
                    <td className="px-3 py-2 font-semibold">{year}</td>
                    <td className="px-3 py-2 text-right">{php(live?.total_income ?? 0)}</td>
                    <td className="px-3 py-2 text-right">{php(live?.total_expenses ?? 0)}</td>
                    <td
                      className={`px-3 py-2 text-right font-semibold ${
                        (live?.balance ?? 0) < 0 ? "text-danger" : ""
                      }`}
                    >
                      {php(live?.balance ?? 0)}
                    </td>
                    <td className="px-3 py-2">
                      {snap ? (
                        <Badge tone="ok">
                          saved {new Date(snap.computed_at).toLocaleDateString()}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">not saved</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          onClick={() => openDetail(year)}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="text-primary hover:underline disabled:opacity-50"
                          disabled={saving === year}
                          onClick={() => saveSnapshot(year)}
                        >
                          {saving === year ? "Saving…" : snap ? "Re-save" : "Save snapshot"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        A snapshot freezes the year&apos;s totals as of now (prepared by you). Live numbers keep
        changing if more transactions are recorded.
      </p>

      <Modal
        open={detail !== null}
        title={detail ? `AY ${detail.year}` : ""}
        onClose={() => setDetail(null)}
        footer={
          <button type="button" className={btnGhost} onClick={() => setDetail(null)}>
            Close
          </button>
        }
      >
        {detailLoading ? (
          <Spinner />
        ) : detail ? (
          <div className="space-y-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="px-2 py-2">Source</th>
                  <th className="px-2 py-2 text-right">Income</th>
                  <th className="px-2 py-2 text-right">Expenses</th>
                  <th className="px-2 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="px-2 py-2 font-semibold">Live</td>
                  <td className="px-2 py-2 text-right">{php(detail.data.live.total_income)}</td>
                  <td className="px-2 py-2 text-right">{php(detail.data.live.total_expenses)}</td>
                  <td className="px-2 py-2 text-right font-semibold">
                    {php(detail.data.live.balance)}
                  </td>
                </tr>
                <tr>
                  <td className="px-2 py-2 font-semibold">Snapshot</td>
                  <td className="px-2 py-2 text-right">
                    {detail.data.snapshot ? php(detail.data.snapshot.total_income) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {detail.data.snapshot ? php(detail.data.snapshot.total_expenses) : "—"}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold">
                    {detail.data.snapshot ? php(detail.data.snapshot.balance) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
            {detail.data.snapshot && (
              <div className="rounded-lg border border-line bg-tint px-3 py-2 text-xs text-muted">
                Prepared by <strong>{detail.data.snapshot.prepared_by}</strong> on{" "}
                {new Date(detail.data.snapshot.computed_at).toLocaleString()}
              </div>
            )}
            {!detail.data.snapshot && (
              <p className="text-sm text-muted">No snapshot saved for this year yet.</p>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
