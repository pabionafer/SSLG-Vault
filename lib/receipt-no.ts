import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Next official receipt number.
 *
 * Atomic: the counter is advanced inside Postgres by public.next_receipt_no()
 * (migration 001) under a row lock, so two concurrent requests can never be
 * handed the same number — the old read-modify-write here raced and ignored
 * update errors.
 *
 * Callers must reserve numbers only AFTER their own validation has passed.
 * A failed insert afterwards still leaves a gap in the series; closing that
 * would require a single transaction spanning PostgREST, which the platform
 * does not offer.
 */
export async function nextReceiptNo(): Promise<string> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("next_receipt_no");
  if (error) throw new Error(`next_receipt_no failed: ${error.message}`);
  if (typeof data !== "string" || !data) throw new Error("next_receipt_no returned no value");
  return data;
}
