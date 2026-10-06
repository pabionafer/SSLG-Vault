import { createAdminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "login"
  | "logout"
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "purge"
  | "import"
  | "export"
  | "approve"
  | "reject"
  | "void"
  | "print"
  | "download"
  | "settings_update"
  | "username_request"
  | "role_change";

/**
 * Writes one row to audit_log using the service-role client.
 * Never throws — failures are only console.logged (spec §14 step 4).
 */
export async function logAction(
  username: string | null,
  action: AuditAction,
  targetTable?: string | null,
  targetId?: string | number | null,
  details?: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("audit_log").insert({
      username,
      action,
      target_table: targetTable ?? null,
      target_id: targetId == null ? null : String(targetId),
      details: details ?? {},
    });
    if (error) console.error("logAction insert error:", error.message);
  } catch (err) {
    console.error("logAction failed:", err);
  }
}
