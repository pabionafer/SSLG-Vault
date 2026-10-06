import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "treasurer" | "president" | "officer" | "adviser";

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  bio: string | null;
  profile_image_url: string | null;
  pending_username: string | null;
  username_requested_at: string | null;
  created_at: string;
  updated_at: string;
}

export const GUARDS = {
  admin: ["admin"],
  treasurer: ["admin", "treasurer"],
  paymentRecorder: ["admin", "treasurer", "president"],
  studentManager: ["admin", "treasurer", "president"],
  expenseManager: ["admin", "treasurer", "president"],
  igpEditor: ["admin", "treasurer", "president", "officer"],
  igpManager: ["admin", "treasurer", "president"],
} as const satisfies Record<string, readonly Role[]>;

export type GuardName = keyof typeof GUARDS;

// Pure role checks — one per row of the spec §5 guard table.
export const verifyAdmin = (role: Role | null | undefined) => role === "admin";
export const verifyTreasurer = (role: Role | null | undefined) =>
  role === "admin" || role === "treasurer";
export const verifyPaymentRecorder = (role: Role | null | undefined) =>
  role === "admin" || role === "treasurer" || role === "president";
export const verifyStudentManager = (role: Role | null | undefined) =>
  role === "admin" || role === "treasurer" || role === "president";
export const verifyExpenseManager = (role: Role | null | undefined) =>
  role === "admin" || role === "treasurer" || role === "president";
export const verifyIgpEditor = (role: Role | null | undefined) =>
  role === "admin" || role === "treasurer" || role === "president" || role === "officer";
export const verifyIgpManager = (role: Role | null | undefined) =>
  role === "admin" || role === "treasurer" || role === "president";

export const VERIFY: Record<GuardName, (role: Role | null | undefined) => boolean> = {
  admin: verifyAdmin,
  treasurer: verifyTreasurer,
  paymentRecorder: verifyPaymentRecorder,
  studentManager: verifyStudentManager,
  expenseManager: verifyExpenseManager,
  igpEditor: verifyIgpEditor,
  igpManager: verifyIgpManager,
};

export type Guarded =
  | { user: User; profile: Profile; response?: undefined }
  | { response: NextResponse; user?: undefined; profile?: undefined };

/** Any logged-in, active user (no specific guard). Same 401/403 contract. */
export async function requireUser(): Promise<Guarded> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) {
    return {
      response: NextResponse.json({ error: "Account is inactive or missing" }, { status: 403 }),
    };
  }
  return { user, profile: profile as Profile };
}

/**
 * Route-handler guard. Returns either the authed user + profile, or a ready
 * 401/403 JSON response:
 *   401 — not logged in
 *   403 — logged in but role not allowed / account inactive
 */
export async function requireRole(guard: GuardName): Promise<Guarded> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    return { response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    return {
      response: NextResponse.json({ error: "Account is inactive or missing" }, { status: 403 }),
    };
  }

  if (!VERIFY[guard](profile.role)) {
    return {
      response: NextResponse.json(
        { error: `Forbidden: requires one of [${GUARDS[guard].join(", ")}]` },
        { status: 403 },
      ),
    };
  }

  return { user, profile: profile as Profile };
}

/** Logged-in profile or null (for server components / pages). */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}
