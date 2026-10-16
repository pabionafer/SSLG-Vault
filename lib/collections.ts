import { createAdminClient } from "@/lib/supabase/admin";

type Db = ReturnType<typeof createAdminClient>;

/**
 * Recompute collections.total_amount from the live payments in that batch
 * (posted, not soft-deleted).
 *
 * This replaces six separate read-modify-write increments that could lose an
 * update under concurrency and silently clamped negatives with Math.max(0, …).
 * The arithmetic happens in one UPDATE inside Postgres
 * (public.recompute_collection_total, migration 001), so the stored total can
 * no longer drift away from the payments table.
 *
 * Throws on failure: callers already funnel errors into serverError(), which
 * is what we want — a visible error beats a wrong total.
 */
export async function recomputeCollectionTotal(
  db: Db,
  collectionId: number | string | null | undefined,
): Promise<void> {
  if (collectionId == null) return;
  const { error } = await db.rpc("recompute_collection_total", { p_id: collectionId });
  if (error) throw new Error(`recompute_collection_total failed: ${error.message}`);
}
