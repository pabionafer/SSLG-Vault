"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, type GuardName } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { api } from "@/lib/client/api";

interface Card {
  key: string;
  label: string;
  guard?: GuardName;
  href: string;
  value: string;
  sub?: string;
}

const php = (n: number) =>
  `₱${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function DashboardPage() {
  const { can, profile } = useSession();
  const { push } = useToast();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [activity, setActivity] = useState<
    { id: string; username: string | null; action: string; target_table: string | null; created_at: string }[]
  >([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const built: Card[] = [];

      const students = await api<{ total: number }>("/api/students?limit=1");
      if (!cancelled && students.ok)
        built.push({
          key: "students",
          label: "Students",
          href: "/students",
          value: String(students.data.total ?? 0),
          sub: "active records",
        });

      if (can("paymentRecorder")) {
        const from = new Date();
        from.setDate(from.getDate() - 30);
        const [summary, def] = await Promise.all([
          api<{ total: number; count: number }>(
            `/api/payments/summary?from=${from.toISOString().slice(0, 10)}`,
          ),
          api<{ count: number; total_balance: number }>("/api/defaulters/summary"),
        ]);
        if (!cancelled && summary.ok)
          built.push({
            key: "collected",
            label: "Collected (30 days)",
            guard: "paymentRecorder",
            href: "/payments",
            value: php(summary.data.total ?? 0),
            sub: `${summary.data.count ?? 0} payments`,
          });
        if (!cancelled && def.ok)
          built.push({
            key: "defaulters",
            label: "Defaulting payments",
            guard: "paymentRecorder",
            href: "/defaulters",
            value: String(def.data.count ?? 0),
            sub: `${php(def.data.total_balance ?? 0)} at stake`,
          });
      }

      if (can("expenseManager")) {
        const exp = await api<{ total: number; count: number }>("/api/expenses/summary");
        if (!cancelled && exp.ok)
          built.push({
            key: "expenses",
            label: "Expenses",
            guard: "expenseManager",
            href: "/expenses",
            value: php(exp.data.total ?? 0),
            sub: `${exp.data.count ?? 0} entries`,
          });
      }

      if (can("treasurer")) {
        const report = await api<{ balance: number; total_income: number; total_expenses: number }>(
          "/api/financial-report",
        );
        if (!cancelled && report.ok)
          built.push({
            key: "balance",
            label: "Net balance",
            guard: "treasurer",
            href: "/reports",
            value: php(report.data.balance ?? 0),
            sub: `income ${php(report.data.total_income ?? 0)} · expenses ${php(report.data.total_expenses ?? 0)}`,
          });
      }

      if (can("igpEditor")) {
        const stats = await api<{ total: number; total_income: number }>("/api/igps/stats");
        if (!cancelled && stats.ok)
          built.push({
            key: "igp",
            label: "IGP income",
            guard: "igpEditor",
            href: "/igp",
            value: php(stats.data.total_income ?? 0),
            sub: `${stats.data.total ?? 0} projects`,
          });
      }

      if (!cancelled) setCards(built);

      if (can("admin")) {
        const log = await api<{ items: typeof activity }>("/api/audit-log?limit=8");
        if (!cancelled && log.ok) setActivity(log.data.items ?? []);
      } else if (!cancelled) {
        setActivity([]);
      }
    }

    load().catch(() => {
      if (!cancelled) push("error", "Could not load dashboard data");
    });
    return () => {
      cancelled = true;
    };
  }, [can, push]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted">
          Welcome back, {profile?.full_name ?? profile?.username}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards === null && (
          <>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-24 animate-pulse rounded-lg border border-line bg-surface"
              />
            ))}
          </>
        )}
        {cards?.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="rounded-lg border border-line bg-surface p-4 shadow-sm transition-colors hover:border-primary"
          >
            <div className="text-sm font-medium text-muted">{card.label}</div>
            <div className="mt-1 text-2xl font-bold text-ink">{card.value}</div>
            {card.sub && <div className="mt-1 text-xs text-muted">{card.sub}</div>}
          </Link>
        ))}
        {cards !== null && cards.length === 0 && (
          <p className="text-sm text-muted">No dashboard data for your role yet.</p>
        )}
      </div>

      {activity.length > 0 && (
        <section className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold">Recent activity</h2>
            <Link href="/activity-log" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {activity.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate">
                  <span className="font-semibold">{row.username ?? "system"}</span>{" "}
                  <span className="text-muted">{row.action}</span>{" "}
                  {row.target_table && <span className="text-ink">{row.target_table}</span>}
                </span>
                <time className="shrink-0 text-xs text-muted" dateTime={row.created_at}>
                  {new Date(row.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
