"use client";

import { useState, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SessionProvider, useSession, type GuardName } from "@/lib/client/session";
import { ToastProvider } from "@/lib/client/toast";
import { api, onUnauthorized } from "@/lib/client/api";

interface NavItem {
  href: string;
  label: string;
  guard?: GuardName;
  roles?: string[];
}

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/students", label: "Students", guard: "studentManager" },
  { href: "/fees", label: "Fees", guard: "treasurer" },
  { href: "/payments", label: "Payments", guard: "paymentRecorder" },
  { href: "/collections", label: "Collections", guard: "treasurer" },
  { href: "/receipts", label: "Receipts", guard: "paymentRecorder" },
  { href: "/expenses", label: "Expenses", guard: "expenseManager" },
  { href: "/igp", label: "IGP / Income", guard: "igpEditor" },
  { href: "/clearances", label: "Clearances", guard: "studentManager" },
  { href: "/defaulters", label: "Defaulters", guard: "paymentRecorder" },
  { href: "/reports", label: "Financial Report", guard: "treasurer" },
  { href: "/yearly-balance", label: "Yearly Balance", guard: "treasurer" },
  {
    href: "/trash",
    label: "Trash",
    roles: ["admin", "treasurer", "president", "officer"],
  },
  { href: "/users", label: "Users", guard: "admin" },
  { href: "/activity-log", label: "Activity Log", guard: "admin" },
  { href: "/profile", label: "Profile" },
];

function Shell({ children }: { children: ReactNode }) {
  const { profile, loading, can } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    return onUnauthorized(() => router.push(`/login?next=${next}`));
  }, [router]);

  async function onLogout() {
    setBusy(true);
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const visible = NAV.filter((item) => {
    if (item.guard) return can(item.guard);
    if (item.roles) return item.roles.includes(profile?.role ?? "");
    return true;
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <aside
        className={`no-print fixed inset-y-0 left-0 z-40 w-60 transform border-r border-line bg-surface transition-transform lg:static lg:flex lg:translate-x-0 lg:flex-col ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rufino.jpg" alt="" className="h-8 w-8 rounded-full object-cover" />
          <Link href="/" className="text-lg font-bold text-primary" onClick={() => setOpen(false)}>
            SSLG Vault
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Main">
          {visible.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm font-medium ${
                  active
                    ? "bg-primary text-on-primary"
                    : "text-ink hover:bg-tint"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="no-print fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
          <button
            type="button"
            aria-label="Open menu"
            className="rounded-md border border-line-strong px-2 py-1 text-sm lg:hidden"
            onClick={() => setOpen(true)}
          >
            ☰
          </button>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold leading-tight">
                {profile?.full_name ?? profile?.username}
              </div>
              <div className="text-xs capitalize text-muted">{profile?.role}</div>
            </div>
            <span className="hidden h-9 w-9 items-center justify-center rounded-full bg-tint text-sm font-bold text-primary sm:flex">
              {(profile?.full_name ?? profile?.username ?? "?").charAt(0).toUpperCase()}
            </span>
            <button
              type="button"
              onClick={onLogout}
              disabled={busy}
              className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-tint disabled:opacity-60"
            >
              {busy ? "Signing out…" : "Log out"}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <Shell>{children}</Shell>
      </ToastProvider>
    </SessionProvider>
  );
}
