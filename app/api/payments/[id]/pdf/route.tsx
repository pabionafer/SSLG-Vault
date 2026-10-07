import { type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { notFound, serverError } from "@/lib/api";
import { ReceiptDocument, parseSettings, pdfResponse, type ReceiptDocProps, type SettingsMap } from "@/lib/pdf";

type Ctx = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/payments/[id]/pdf — official receipt PDF for a payment (paymentRecorder)
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;
  const { id } = await ctx.params;

  let docProps: { receipt: ReceiptDocProps["receipt"]; settings: SettingsMap } | null = null;
  try {
    const db = createAdminClient();
    const [{ data: payment, error }, { data: receiptRow }, { data: settingRows }] =
      await Promise.all([
        db
          .from("payments")
          .select("*, student:students(*), fee:fees(id,name)")
          .eq("id", id)
          .is("deleted_at", null)
          .maybeSingle(),
        db.from("receipts").select("issued_by,issued_at").eq("payment_id", id).maybeSingle(),
        db.from("system_settings").select("key,value"),
      ]);
    if (error) return serverError(error);
    if (!payment) return notFound("Payment not found");

    docProps = {
      receipt: {
        receipt_no: payment.receipt_no,
        issued_at: receiptRow?.issued_at ?? payment.created_at,
        issued_by: receiptRow?.issued_by ?? payment.created_by ?? null,
        payment,
      },
      settings: parseSettings(settingRows),
    };
  } catch (err) {
    return serverError(err);
  }

  const doc = <ReceiptDocument receipt={docProps.receipt} settings={docProps.settings} />;
  try {
    const buffer = await renderToBuffer(doc);
    return pdfResponse(buffer, `receipt-${docProps.receipt.receipt_no}.pdf`);
  } catch (err) {
    return serverError(err);
  }
}
