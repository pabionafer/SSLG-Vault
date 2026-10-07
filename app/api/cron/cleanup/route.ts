import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAction } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

// GET /api/cron/cleanup — daily background purge (roadmap Phase 11).
// Vercel cron invokes this once a day. When the CRON_SECRET environment
// variable is set on the project, Vercel sends it automatically as
// "Authorization: Bearer <CRON_SECRET>" on every cron request; any other
// caller gets a 401. The daily queries also ping Supabase so free-tier
// projects are not paused for inactivity.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createAdminClient();
    const cutoff30 = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const cutoff7 = new Date(Date.now() - 7 * DAY_MS).toISOString();

    // Payments: soft-deleted over 30 days, or pending_hard_delete over 7 days.
    const [{ data: oldDeleted, error: dErr }, { data: oldPending, error: pErr }] =
      await Promise.all([
        db
          .from("payments")
          .select("id")
          .not("deleted_at", "is", null)
          .lt("deleted_at", cutoff30),
        db
          .from("payments")
          .select("id")
          .eq("pending_hard_delete", true)
          .not("pending_hard_delete_at", "is", null)
          .lt("pending_hard_delete_at", cutoff7),
      ]);
    if (dErr) throw new Error(dErr.message);
    if (pErr) throw new Error(pErr.message);

    const ids = [
      ...new Set<number>([...(oldDeleted ?? []), ...(oldPending ?? [])].map((r) => r.id)),
    ];

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

    // Collections: inactive over 30 days, but only when no payments still
    // reference them (payments.collection_id has no ON DELETE CASCADE either).
    const [{ data: inactive, error: iErr }, { data: referenced, error: refErr }] =
      await Promise.all([
        db
          .from("collections")
          .select("id")
          .eq("status", "inactive")
          .not("deactivated_at", "is", null)
          .lt("deactivated_at", cutoff30),
        db.from("payments").select("collection_id").not("collection_id", "is", null),
      ]);
    if (iErr) throw new Error(iErr.message);
    if (refErr) throw new Error(refErr.message);

    const used = new Set((referenced ?? []).map((r) => r.collection_id));
    const purgeable = (inactive ?? []).map((r) => r.id).filter((id) => !used.has(id));
    let collectionsDeleted = 0;
    if (purgeable.length > 0) {
      const { data: cd, error: cErr } = await db
        .from("collections")
        .delete()
        .in("id", purgeable)
        .select("id");
      if (cErr) throw new Error(cErr.message);
      collectionsDeleted = cd?.length ?? 0;
    }

    if (paymentsDeleted > 0 || receiptsDeleted > 0 || collectionsDeleted > 0) {
      await logAction("system", "delete", "payments", null, {
        payments: paymentsDeleted,
        receipts: receiptsDeleted,
        collections: collectionsDeleted,
        cutoff30,
        cutoff7,
      });
    }

    return Response.json({
      ok: true,
      payments_deleted: paymentsDeleted,
      receipts_deleted: receiptsDeleted,
      collections_deleted: collectionsDeleted,
      collections_skipped: (inactive ?? []).length - collectionsDeleted,
      ran_at: new Date().toISOString(),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
