import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { parseBody, notFound, serverError, ok, badRequest } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ password: z.string().min(8, "Password must be at least 8 characters") });

// POST /api/users/[id]/password â€” reset password (admin)
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, schema);
  if (body.error) return body.error;

  try {
    const db = createAdminClient();
    const { data: profile } = await db.from("profiles").select("username").eq("id", id).maybeSingle();
    if (!profile) return notFound("User not found");

    const { error } = await db.auth.admin.updateUserById(id, { password: body.data.password });
    if (error) return badRequest(`Could not update password: ${error.message}`);

    await logAction(auth.profile.username, "update", "profiles", id, {
      target: profile.username,
      field: "password",
      note: "password reset",
    });
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
