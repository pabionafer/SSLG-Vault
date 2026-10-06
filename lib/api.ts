import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";

export function ok(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function created(data: unknown): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function notFound(msg = "Not found"): NextResponse {
  return NextResponse.json({ error: msg }, { status: 404 });
}

export function badRequest(msg: string, details?: unknown): NextResponse {
  return NextResponse.json({ error: msg, ...(details ? { details } : {}) }, { status: 400 });
}

export function conflict(msg: string): NextResponse {
  return NextResponse.json({ error: msg }, { status: 409 });
}

export function serverError(err: unknown): NextResponse {
  console.error("API error:", err);
  const msg = err instanceof Error ? err.message : "Internal error";
  return NextResponse.json({ error: msg }, { status: 500 });
}

/** Parse + validate a JSON body. Returns the data or a ready 400 response. */
export async function parseBody<T>(
  req: NextRequest,
  schema: ZodType<T>,
): Promise<{ data: T; error?: undefined } | { data?: undefined; error: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: badRequest("Invalid JSON body") };
  }
  try {
    return { data: schema.parse(json) };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        error: NextResponse.json(
          { error: "Validation failed", details: err.issues },
          { status: 400 },
        ),
      };
    }
    throw err;
  }
}

export interface Paging {
  page: number;
  limit: number;
  offset: number;
  q: string | null;
  range: readonly [number, number];
}

/** page / limit / q from the query string (limit capped at 200). */
export function paging(req: NextRequest, defaultLimit = 25): Paging {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const limit = Math.min(
    200,
    Math.max(1, Number(sp.get("limit") ?? defaultLimit) || defaultLimit),
  );
  const offset = (page - 1) * limit;
  const q = sp.get("q")?.trim() || null;
  return { page, limit, offset, q, range: [offset, offset + limit - 1] };
}

/** List response with X-Total-Count (used by the screens for pagination). */
export function listResponse<T>(items: T[], total: number, p: Paging): NextResponse {
  return NextResponse.json(
    { items, total, page: p.page, limit: p.limit },
    { headers: { "X-Total-Count": String(total) } },
  );
}
