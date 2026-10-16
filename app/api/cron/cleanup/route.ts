import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
/** Per-PostgREST request cap: projects default to db.max-rows = 1000, so we
 *  page through victims instead of trusting one unbounded SELECT. */
const BATCH = 500;

// GET /api/cron/cleanup — daily background purge (roadmap Phase 11).
// Vercel cron invokes this once a day. When the CRON_SECRET environment
// variable is set on the project, Vercel sends it automatically as
// "Authorization: Bearer <CRON_SECRET>" on every cron request; any other
// caller gets a 401. The daily queries also ping Supabase so free-tier
// projects are not paused for inactivity.
//
// Windows (scripts/schema.sql §payments):
//   deleted_at older than 30 days  -> flagged pending_hard_delete (notice period)
//   pending_hard_delete_at older
//     than 7 days                  -> hard deleted
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  const provided = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createAdminClient();
    const cutoff30 = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const cutoff7 = new Date(Date.now() - 7 * DAY_MS).toISOString();

    // 1. Stage: soft-deleted for 30 days → start the 7-day notice window.
    const { data: stage, error: sErr } = await db
      .from("payments")
      .select("id")
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoff30)
      .eq("pending_hard_delete", false)
      .limit(BATCH);
    if (sErr) throw new Error(sErr.message);

    let staged = 0;
    if ((stage ?? []).length > 0) {
      const now = new Date().toISOString();
      const { data: upd, error: uErr } = await db
        .from("payments")
        .update({ pending_hard_delete: true, pending_hard_delete_at: now })
        .in(
          "id",
          stage.map((r) => r.id),
        )
        .select("id");
      if (uErr) throw new Error(uErr.message);
      staged = upd?.length ?? 0;
    }

    // 2. Purge: past the 7-day notice window (either explicitly scheduled by an
    //    admin via schedule-purge, or staged by step 1 above).
    const { data: purgeable, error: pErr } = await db
      .from("payments")
      .select("id")
      .eq("pending_hard_delete", true)
      .not("pending_hard_delete_at", "is", null)
      .lt("pending_hard_delete_at", cutoff7)
      .limit(BATCH);
    if (pErr) throw new Error(pErr.message);

    const ids = [...new Set<number>((purgeable ?? []).map((r) => r.id))];

    let receiptsDeleted = 0;
    let paymentsDeleted = 0;
    if (ids.length > 0) {
      // receipts.payment_id is NOT NULL without ON DELETE CASCADE, so purge first.
      const { data: rc, error: rErr } = await db
        .from("receipts")
        .delete()
        .in("payment_id", ids)
        .select("id");
      if (rErr) throw new Error(rErr.message);
      receiptsDeleted = rc?.length ?? 0;

      const { data: pd, error: payErr } = await db
        .from("payments")
        .delete()
        .in("id", ids)
        .select("id");
      if (payErr) throw new Error(payErr.message);
      paymentsDeleted = pd?.length ?? 0;
    }

    // 3. Collections: closed (inactive) for 30 days, never soft-deleted (a
    //    restored Trash item must not be destroyed), and unreferenced.
    //    payments.collection_id has no ON DELETE CASCADE, so check per id.
    const { data: inactive, error: iErr } = await db
      .from("collections")
      .select("id")
      .eq("status", "inactive")
      .not("deactivated_at", "is", null)
      .lt("deactivated_at", cutoff30)
      .is("deleted_at", null)
      .limit(BATCH);
    if (iErr) throw new Error(iErr.message);

    let collectionsDeleted = 0;
    for (const row of inactive ?? []) {
      const { data: refs, error: refErr } = await db
        .from("payments")
        .select("id")
        .eq("collection_id", row.id)
        .limit(1);
      if (refErr) throw new Error(refErr.message);
      if ((refs ?? []).length > 0) continue;
      const { error: delErr } = await db.from("collections").delete().eq("id", row.id);
      if (delErr) throw new Error(delErr.message);
      collectionsDeleted++;
    }

    if (paymentsDeleted > 0 || receiptsDeleted > 0 || collectionsDeleted > 0 || staged > 0) {
      await logAction("system", "purge", "payments", null, {
        staged,
        payments: paymentsDeleted,
        receipts: receiptsDeleted,
        collections: collectionsDeleted,
        cutoff30,
        cutoff7,
      });
    }

    return Response.json({
      ok: true,
      payments_staged: staged,
      payments_deleted: paymentsDeleted,
      receipts_deleted: receiptsDeleted,
      collections_deleted: collectionsDeleted,
      collections_skipped: (inactive ?? []).length - collectionsDeleted,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("cron/cleanup failed:", err);
    // never echo internal errors (DB details) to the caller
    return Response.json({ error: "Cleanup failed" }, { status: 500 });
  }
}

/** Length-exposed constant-time comparison for the cron secret. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
