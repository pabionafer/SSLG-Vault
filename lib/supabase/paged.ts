// Keyset-paged fetch helper for aggregation queries.
//
// Supabase's Data API (PostgREST) caps every response at the project's
// `db.max_rows` (default 1000), no matter how large a .limit() you pass.
// Aggregations that "fetch the whole table" therefore silently computed
// totals over the first 1000 rows. This helper pages by id until the
// response comes back short.
//
// Assumption: the page size below is <= the project's db.max_rows
// (Supabase's default is 1000).

const PAGE_SIZE = 500;
const MAX_PAGES = 400; // 200k rows — well beyond anything this app deals with

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Run a query repeatedly, advancing a keyset cursor on `id`.
 *
 *   fetchAllByKeyset((from) => db.from("payments")
 *     .select("amount,fee_id")
 *     .gt("id", from)
 *     .limit(PAGE_LIMIT)
 *     .order("id", { ascending: true }));
 *
 * The callback receives the exclusive lower bound (start with 0) and must
 * apply `.gt("id", from)`, `.limit(PAGE_LIMIT)` and
 * `.order("id", { ascending: true })`.
 * Throws on the first query error.
 */
export async function fetchAllByKeyset<T extends { id: number | string }>(
  run: (from: number | string) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: number | string = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await run(cursor);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
    const last = rows[rows.length - 1].id;
    // bigserial ids are numeric; guard against a non-numeric id scheme
    const next = typeof last === "number" ? last : Number(last);
    if (!Number.isFinite(next)) return out;
    cursor = next;
  }
  return out;
}

export const PAGE_LIMIT = PAGE_SIZE;
