import { type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, serverError } from "@/lib/api";
import { ReceiptDocument, parseSettings, pdfResponse } from "@/lib/pdf";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/receipts/[id]/pdf — official receipt PDF (paymentRecorder)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  try {
    const db = createAdminClient();
    const [{ data: receipt, error }, { data: settingRows }] = await Promise.all([
      db
        .from("receipts")
        .select("*, payment:payments(*, student:students(*), fee:fees(id,name))")
        .eq("id", id)
        .maybeSingle(),
      db.from("system_settings").select("key,value"),
    ]);
    if (error) return serverError(error);
    if (!receipt) return notFound("Receipt not found");

    const settings = parseSettings(settingRows);
    const buffer = await renderToBuffer(
      <ReceiptDocument receipt={receipt as never} settings={settings} />,
    );
    return pdfResponse(buffer, `receipt-${receipt.receipt_no}.pdf`);
  } catch (err) {
    return serverError(err);
  }
}
