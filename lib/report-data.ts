import { createAdminClient } from "@/lib/supabase/admin";

export type Db = ReturnType<typeof createAdminClient>;

export const SEMESTERS = ["1st Semester", "2nd Semester", "Summer"] as const;

export interface ReportFilters {
  from: string | null;
  to: string | null;
  academic_year: string | null;
  semester: string | null;
}

/**
 * Shared query-string filters for every /api/financial-report/* endpoint.
 * `semester` is only accepted when it is one of the DB enum values (it is
 * interpolated into a PostgREST or() filter).
 */
export function readFilters(sp: URLSearchParams): ReportFilters {
  const sem = sp.get("semester");
  return {
    from: sp.get("from"),
    to: sp.get("to"),
    academic_year: sp.get("academic_year"),
    semester: sem && (SEMESTERS as readonly string[]).includes(sem) ? sem : null,
  };
}

/**
 * Semester filter that keeps rows with `semester IS NULL` — payments, income
 * and expenses are allowed to have no semester, and `.eq()` alone silently
 * dropped them from semester-scoped totals.
 *
 * Apply inside a query builder closure: `if (f.semester) q = applySemester(q, f.semester)`
 * (type kept loose because the builder types differ per table).
 */
export function applySemester<T>(q: T, semester: string): T {
  const builder = q as unknown as {
    or: (filter: string) => unknown;
  };
  return builder.or(`semester.eq.${semester},semester.is.null`) as unknown as T;
}
