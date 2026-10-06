import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser } from "@/lib/roles";
import { parseBody, serverError, conflict, ok } from "@/lib/api";
import { logAction } from "@/lib/audit";

const usernameRe = /^[a-zA-Z0-9_.-]{3,30}$/;

const schema = z.object({
  full_name: z.string().min(1).max(120).optional(),
  bio: z.string().max(500).nullish(),
  profile_image_url: z.string().url().nullish(),
  username: z.string().regex(usernameRe, "3-30 chars: letters, numbers, _ . -").optional(),
});

// PATCH /api/users/me — edit own profile; a new username becomes a pending request (admin approves)
export async function PATCH(req: NextRequest) {
  const auth = await requireUser();
  if (auth.response) return auth.response;

  const body = await parseBody(req, schema);
  if (body.error) return body.error;
  const input = body.data;

  try {
    const db = createAdminClient();
    const updates: Record<string, unknown> = {};

    if (input.full_name !== undefined) updates.full_name = input.full_name;
    if (input.bio !== undefined) updates.bio = input.bio;
    if (input.profile_image_url !== undefined) updates.profile_image_url = input.profile_image_url;

    if (input.username && input.username.toLowerCase() !== auth.profile.username.toLowerCase()) {
      const { data: taken } = await db
        .from("profiles")
        .select("id")
        .ilike("username", input.username)
        .maybeSingle();
      if (taken) return conflict("Username already taken");
      updates.pending_username = input.username;
      updates.username_requested_at = new Date().toISOString();
      await logAction(auth.profile.username, "username_request", "profiles", auth.profile.id, {
        requested: input.username,
      });
    }

    if (Object.keys(updates).length === 0) return ok({ user: auth.profile });

    const { data, error } = await db
      .from("profiles")
      .update(updates)
      .eq("id", auth.profile.id)
      .select("*")
      .single();
    if (error) return serverError(error);

    if (!updates.pending_username) {
      await logAction(auth.profile.username, "update", "profiles", auth.profile.id, {
        fields: Object.keys(updates),
      });
    }
    return ok({ user: data });
  } catch (err) {
    return serverError(err);
  }
}
