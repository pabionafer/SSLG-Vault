import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Next official receipt number from system_settings.or_series_start.
 * Read-modify-write (single-instance dev use; a DB sequence would be needed
 * under heavy concurrency).
 */
export async function nextReceiptNo(): Promise<string> {
  const db = createAdminClient();
  const { data } = await db
    .from("system_settings")
    .select("value")
    .eq("key", "or_series_start")
    .maybeSingle();

  const raw = data ? String(data.value).replace(/"/g, "") : "000001";
  const current = Number.parseInt(raw, 10) || 0;
  const next = current + 1;

  await db
    .from("system_settings")
    .update({ value: JSON.stringify(String(next).padStart(6, "0")) })
    .eq("key", "or_series_start");

  return String(current).padStart(6, "0");
}
