import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Spec §5: 5 failed attempts per minute per IP → "Too many login attempts".
// In-memory is fine for local/dev; a shared store is needed when multi-instance.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const now = Date.now();

  const rec = attempts.get(ip);
  if (rec && rec.resetAt > now && rec.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: "Too many login attempts" }, { status: 429 });
  }

  let body: { identifier?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const identifier = String(body.identifier ?? "").trim();
  const password = String(body.password ?? "");
  if (!identifier || !password) {
    return NextResponse.json({ error: "Username/email and password are required" }, { status: 400 });
  }

  const fail = (status: number, error: string) => {
    const cur = attempts.get(ip);
    if (cur && cur.resetAt > now) {
      cur.count += 1;
    } else {
      attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    }
    return NextResponse.json({ error }, { status });
  };

  // Username → email resolution (Supabase Auth is email-keyed).
  let email: string | null = identifier.includes("@") ? identifier : null;
  if (!email) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", identifier)
      .maybeSingle();
    if (profile) {
      const { data: res } = await admin.auth.admin.getUserById(profile.id);
      email = res?.user?.email ?? null;
    }
    if (!email) return fail(401, "Invalid username or password");
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return fail(401, "Invalid username or password");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(401, "Invalid username or password");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    await supabase.auth.signOut();
    return fail(403, "Account is inactive");
  }

  attempts.delete(ip);
  return NextResponse.json({
    user: {
      id: profile.id,
      username: profile.username,
      full_name: profile.full_name,
      role: profile.role,
    },
  });
}
