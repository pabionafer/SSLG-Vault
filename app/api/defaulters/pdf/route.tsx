import { type NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { serverError } from "@/lib/api";
import { computeAllDefaulters, type GlobalDefaulter } from "@/lib/defaulters";
import { DefaultersDocument, parseSettings, pdfResponse, type SettingsMap } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/defaulters/pdf?as_of=&academic_year=&semester= (paymentRecorder)
export async function GET(req: NextRequest) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;

  let docProps: {
    items: GlobalDefaulter[];
    asOf: string;
    filters: string;
    settings: SettingsMap;
  } | null = null;
  try {
    const sp = req.nextUrl.searchParams;
    const academicYear = sp.get("academic_year") ?? undefined;
    const semester = sp.get("semester") ?? undefined;
    const result = await computeAllDefaulters({
      as_of: sp.get("as_of") ?? undefined,
      academic_year: academicYear,
      semester,
    });
    if (!result.ok) return serverError(new Error(result.error));

    const db = createAdminClient();
    const { data: settingRows } = await db.from("system_settings").select("key,value");
    const filters =
      [academicYear ? `A.Y. ${academicYear}` : null, semester ?? null]
        .filter(Boolean)
        .join(" · ") || "All academic years";

    docProps = {
      items: result.items,
      asOf: result.as_of,
      filters,
      settings: parseSettings(settingRows),
    };
  } catch (err) {
    return serverError(err);
  }

  const doc = (
    <DefaultersDocument
      items={docProps.items}
      asOf={docProps.asOf}
      filters={docProps.filters}
      settings={docProps.settings}
    />
  );
  try {
    const buffer = await renderToBuffer(doc);
    return pdfResponse(buffer, `defaulters-${docProps.asOf}.pdf`);
  } catch (err) {
    return serverError(err);
  }
}
