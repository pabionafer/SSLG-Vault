import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { listResponse, paging, parseBody, serverError, conflict, created } from "@/lib/api";
import { logAction } from "@/lib/audit";

const roleEnum = z.enum(["admin", "treasurer", "president", "officer", "adviser"]);
const usernameRe = /^[a-zA-Z0-9_.-]{3,30}$/;

// GET /api/users?q=&role=&is_active=&page=&limit=  (admin)
export async function GET(req: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const p = paging(req);
    const sp = req.nextUrl.searchParams;

    let q = db.from("profiles").select("*", { count: "exact" });
    const role = sp.get("role");
    if (role) q = q.eq("role", role);
    const active = sp.get("is_active");
    if (active === "true" || active === "false") q = q.eq("is_active", active === "true");
    if (p.q) {
      const term = p.q.replace(/[%,()]/g, " ").trim();
      q = q.or(`username.ilike.%${term}%,full_name.ilike.%${term}%`);
    }

    const { data, count, error } = await q
      .order("username", { ascending: true })
      .range(p.range[0], p.range[1]);
    if (error) return serverError(error);
    return listResponse(data ?? [], count ?? 0, p);
  } catch (err) {
    return serverError(err);
  }
}

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  username: z.string().regex(usernameRe, "3-30 chars: letters, numbers, _ . -"),
  full_name: z.string().min(1).max(120),
  role: roleEnum,
});

// POST /api/users â€” create auth user + profile (admin)
export async function POST(req: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;

  const body = await parseBody(req, createSchema);
  if (body.error) return body.error;
  const input = body.data;

  try {
    const db = createAdminClient();

    const { data: res, error: authErr } = await db.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { username: input.username, full_name: input.full_name },
    });
    if (authErr) {
      return conflict(
        authErr.message.includes("already registered")
          ? "Email already registered"
          : `Could not create user: ${authErr.message}`,
      );
    }

    const { error: profileErr } = await db.from("profiles").insert({
      id: res.user.id,
      username: input.username,
      full_name: input.full_name,
      role: input.role,
      is_active: true,
    });
    if (profileErr) {
      await db.auth.admin.deleteUser(res.user.id).catch(() => {});
      if (profileErr.code === "23505") return conflict("Username already taken");
      return serverError(profileErr);
    }

    await logAction(auth.profile.username, "create", "profiles", res.user.id, {
      username: input.username,
      role: input.role,
    });
    return created({
      id: res.user.id,
      username: input.username,
      full_name: input.full_name,
      role: input.role,
      is_active: true,
    });
  } catch (err) {
    return serverError(err);
  }
}
