import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { parseBody, notFound, conflict, serverError, ok } from "@/lib/api";
import { logAction } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/users/[id] (admin)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data, error } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) return serverError(error);
    if (!data) return notFound("User not found");
    return ok({ user: data });
  } catch (err) {
    return serverError(err);
  }
}

const patchSchema = z.object({
  full_name: z.string().min(1).max(120).optional(),
  role: z.enum(["admin", "treasurer", "president", "officer", "adviser"]).optional(),
  is_active: z.boolean().optional(),
  bio: z.string().max(500).nullish(),
  profile_image_url: z.string().url().nullish(),
  approve_username: z.boolean().optional(),
});

// PATCH /api/users/[id] â€” update profile, role, active flag (admin)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  const body = await parseBody(req, patchSchema);
  if (body.error) return body.error;
  const input = body.data;

  try {
    const db = createAdminClient();
    const { data: existing } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
    if (!existing) return notFound("User not found");

    if (input.is_active === false && existing.id === auth.user.id) {
      return conflict("You cannot deactivate your own account");
    }

    const updates: Record<string, unknown> = {};
    if (input.full_name !== undefined) updates.full_name = input.full_name;
    if (input.role !== undefined) updates.role = input.role;
    if (input.is_active !== undefined) updates.is_active = input.is_active;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.profile_image_url !== undefined) updates.profile_image_url = input.profile_image_url;
    if (input.approve_username && existing.pending_username) {
      updates.username = existing.pending_username;
      updates.pending_username = null;
      updates.username_requested_at = null;
    }
    if (Object.keys(updates).length === 0) return ok({ user: existing });

    const { data, error } = await db
      .from("profiles")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") return conflict("Username already taken");
      return serverError(error);
    }

    if (input.role && input.role !== existing.role) {
      await logAction(auth.profile.username, "role_change", "profiles", id, {
        from: existing.role,
        to: input.role,
        target: existing.username,
      });
    } else {
      await logAction(auth.profile.username, "update", "profiles", id, {
        target: existing.username,
        fields: Object.keys(updates),
      });
    }
    return ok({ user: data });
  } catch (err) {
    return serverError(err);
  }
}

// DELETE /api/users/[id] â€” soft deactivation (admin)
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("admin");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const { data: existing } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
    if (!existing) return notFound("User not found");
    if (existing.id === auth.user.id) return conflict("You cannot deactivate your own account");

    const { error } = await db.from("profiles").update({ is_active: false }).eq("id", id);
    if (error) return serverError(error);

    await logAction(auth.profile.username, "delete", "profiles", id, {
      target: existing.username,
      note: "deactivated (soft)",
    });
    return ok({ ok: true });
  } catch (err) {
    return serverError(err);
  }
}
