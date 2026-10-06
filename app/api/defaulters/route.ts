import { type NextRequest } from "next/server";
import { requireRole } from "@/lib/roles";
import { listResponse, paging, serverError } from "@/lib/api";
import { computeAllDefaulters } from "@/lib/defaulters";

// GET /api/defaulters?as_of=&academic_year=&semester= (paymentRecorder)
export async function GET(req: NextRequest) {
  const auth = await requireRole("paymentRecorder");
  if (auth.response) return auth.response;

  try {
    const sp = req.nextUrl.searchParams;
    const result = await computeAllDefaulters({
      as_of: sp.get("as_of") ?? undefined,
      academic_year: sp.get("academic_year"),
      semester: sp.get("semester"),
    });
    if (!result.ok) return serverError(new Error(result.error));

    const p = paging(req, 50);
    const start = p.range[0];
    const page = result.items.slice(start, start + p.limit + 1);
    const resp = listResponse(page, result.items.length, p);
    resp.headers.set("X-As-Of", result.as_of);
    return resp;
  } catch (err) {
    return serverError(err);
  }
}
