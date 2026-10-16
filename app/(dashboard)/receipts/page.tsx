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

interface ReceiptSnapshot {
  receipt_no?: string;
  payment_date?: string;
  amount?: number;
  mode?: string;
  student_no?: string;
  student_name?: string | null;
  fee_name?: string | null;
  academic_year?: string;
  semester?: string | null;
}

interface Receipt {
  id: number;
  receipt_no: string;
  payment_id: number;
  amount: number;
  snapshot: ReceiptSnapshot;
  issued_at: string;
  issued_by: string | null;
  payment: {
    id: number;
    receipt_no: string;
    payment_date: string;
    status: string;
  } | null;
}

interface PaymentHit {
  id: number;
  receipt_no: string;
  payment_date: string;
  amount: number;
  status: string;
  student: { first_name: string; last_name: string } | null;
  fee: { name: string } | null;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  posted: "ok",
  draft: "warn",
  void: "danger",
};

export default function ReceiptsPage() {
  const { can } = useSession();
  const { push } = useToast();
  const canIssue = can("paymentRecorder");

  const [rows, setRows] = useState<Receipt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 25;

  const [issueOpen, setIssueOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [hits, setHits] = useState<PaymentHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [issuing, setIssuing] = useState<number | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);

  const [viewing, setViewing] = useState<Receipt | null>(null);
  const [confirming, setConfirming] = useState<PaymentHit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api<{ items: Receipt[]; total: number }>(
      `/api/receipts?page=${page}&limit=${limit}`,
    );
    setLoading(false);
    if (res.ok) {
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setError(null);
    } else {
      const data = res.data as { error?: string };
      setError(data.error ?? "Could not load receipts");
    }
  }, [page]);

  useEffect(() => {
    const t = window.setTimeout(load, 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (!searchQ.trim()) return;
    const t = window.setTimeout(async () => {
      setSearching(true);
      const res = await api<{ items: PaymentHit[] }>(
        `/api/payments?q=${encodeURIComponent(searchQ.trim())}&limit=10`,
      );
      setSearching(false);
      if (res.ok) setHits(res.data.items ?? []);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchQ]);

  function openIssue() {
    setSearchQ("");
    setHits([]);
    setIssueError(null);
    setIssueOpen(true);
  }

  async function issueFor(paymentId: number) {
    setIssuing(paymentId);
    setIssueError(null);
    const res = await api<{ receipt: Receipt }>("/api/receipts", {
      method: "POST",
      json: { payment_id: paymentId },
    });
    setIssuing(null);
    if (res.ok) {
      setConfirming(null);
      setIssueOpen(false);
      push("success", "Official receipt issued");
      load();
    } else {
      const data = res.data as { error?: string };
      setIssueError(data.error ?? "Could not issue receipt");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Official Receipts</h1>
          <p className="text-sm text-muted">{total} issued receipts</p>
        </div>
        {canIssue && (
          <button type="button" className={btnPrimary} onClick={openIssue}>
            Issue receipt
          </button>
        )}
      </div>

      {error && <ErrorNote message={error} />}
      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState message="No receipts issued yet. Issue one from a recorded payment." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="px-3 py-2">Receipt no</th>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Fee</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Payment date</th>
                <th className="px-3 py-2">Payment status</th>
                <th className="px-3 py-2">Issued</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-medium">{row.receipt_no}</td>
                  <td className="px-3 py-2">{row.snapshot?.student_name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted">{row.snapshot?.fee_name ?? "—"}</td>
                  <td className="px-3 py-2">{php(Number(row.amount))}</td>
                  <td className="px-3 py-2">{row.snapshot?.payment_date ?? row.payment?.payment_date ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONE[row.payment?.status ?? ""] ?? "neutral"}>
                      {row.payment?.status ?? "—"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {row.issued_at.slice(0, 10)}
                    {row.issued_by ? ` · ${row.issued_by}` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" className={btnGhost} onClick={() => setViewing(row)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} limit={limit} total={total} onPage={setPage} />

      <Modal
        open={issueOpen}
        title="Issue official receipt"
        onClose={() => setIssueOpen(false)}
      >
        <div className="space-y-3">
          {issueError && <ErrorNote message={issueError} />}
          <Field
            label="Find payment"
            htmlFor="receipt_search"
            hint="Search by receipt number or reference, then issue the receipt."
          >
            <input
              id="receipt_search"
              type="search"
              value={searchQ}
              onChange={(e) => {
                setSearchQ(e.target.value);
                if (!e.target.value.trim()) setHits([]);
              }}
              placeholder="OR-000123…"
              className={inputCls}
            />
          </Field>
          {searching ? (
            <Spinner />
          ) : hits.length === 0 ? (
            <p className="text-sm text-muted">
              {searchQ.trim() ? "No payments match that search." : "Type a receipt number to search."}
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded border border-line">
              <table className="w-full text-sm">
                <tbody>
                  {hits.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-2 py-2">
                        <div className="font-medium">{p.receipt_no}</div>
                        <div className="text-xs text-muted">
                          {p.student ? `${p.student.last_name}, ${p.student.first_name}` : "—"}
                          {p.fee ? ` · ${p.fee.name}` : ""}
                        </div>
                      </td>
                      <td className="px-2 py-2">{php(Number(p.amount))}</td>
                      <td className="px-2 py-2 text-right">
                        <Badge tone={STATUS_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          className={btnGhost}
                          disabled={issuing === p.id || p.status !== "posted"}
                          onClick={() => setConfirming(p)}
                        >
                          {issuing === p.id ? "Issuing…" : "Issue"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={viewing !== null} title="Receipt snapshot" onClose={() => setViewing(null)}>
        {!viewing ? null : (
          <div className="space-y-2 text-sm">
            <div className="rounded border border-line p-3">
              <div className="text-lg font-bold">{viewing.receipt_no}</div>
              <div>{viewing.snapshot?.student_name ?? "—"}</div>
              {viewing.snapshot?.student_no && (
                <div className="text-muted">ID: {viewing.snapshot.student_no}</div>
              )}
              {viewing.snapshot?.fee_name && <div className="text-muted">{viewing.snapshot.fee_name}</div>}
              <div className="mt-2 text-lg font-semibold">{php(Number(viewing.amount))}</div>
              <div className="text-muted">
                {viewing.snapshot?.payment_date} · {viewing.snapshot?.mode ?? ""}
              </div>
              <div className="text-muted">
                {viewing.snapshot?.academic_year ?? ""}
                {viewing.snapshot?.semester ? ` · ${viewing.snapshot.semester}` : ""}
              </div>
            </div>
            <div className="text-muted">
              Issued {viewing.issued_at.slice(0, 10)}
              {viewing.issued_by ? ` by ${viewing.issued_by}` : ""}
            </div>
            <div className="flex justify-end">
              <button type="button" className={btnGhost} onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Confirm
        open={confirming !== null}
        title="Issue receipt?"
        message={
          confirming
            ? `Issue official receipt for ${confirming.receipt_no} (${php(Number(confirming.amount))})? A snapshot is stored at issue time.`
            : ""
        }
        confirmLabel="Issue"
        busy={issuing === (confirming?.id ?? null)}
        onConfirm={() => {
          if (confirming) issueFor(confirming.id);
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
