import { type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { badRequest, created, ok, parseBody, serverError } from "@/lib/api";
import { logAction } from "@/lib/audit";

const rowSchema = z.object({
  student_no: z.string().min(1).max(40),
  first_name: z.string().min(1).max(80),
  last_name: z.string().min(1).max(80),
  middle_name: z.string().max(80).nullish(),
  year_level: z.coerce.number().int().min(1).max(6),
  course: z.string().max(80).nullish(),
  section: z.string().max(40).nullish(),
  status: z.enum(["enrolled", "graduated", "transferred", "dropped"]).optional(),
  email: z.string().email().nullish().or(z.literal("")),
  contact_no: z.string().max(40).nullish(),
  guardian_name: z.string().max(120).nullish(),
  guardian_contact: z.string().max(40).nullish(),
});

const importSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(1000),
  dry_run: z.boolean().optional(),
});

// POST /api/students/import — bulk import (studentManager). dry_run=true validates only (spec §11).
export async function POST(req: NextRequest) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;

  const body = await parseBody(req, importSchema);
  if (body.error) return body.error;

  const valid: z.infer<typeof rowSchema>[] = [];
  const errors: { row: number; message: string }[] = [];

  body.data.rows.forEach((row, i) => {
    const parsed = rowSchema.safeParse(row);
    if (!parsed.success) {
      errors.push({
        row: i + 1,
        message: parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`).join("; "),
      });
      return;
    }
    valid.push(parsed.data);
  });

  if (body.data.dry_run) {
    return ok({ dry_run: true, valid, errors, total: body.data.rows.length });
  }
  if (valid.length === 0) return badRequest("No valid rows to import", errors);

  try {
    const db = createAdminClient();
    const rows = valid.map((r) => ({ ...r, created_by: auth.profile.username }));
    const { data, error } = await db
      .from("students")
      .upsert(rows, { onConflict: "student_no", ignoreDuplicates: true })
      .select("id,student_no");
    if (error) return serverError(error);

    const inserted = data?.length ?? 0;
    const skipped = valid.length - inserted;
    await logAction(auth.profile.username, "import", "students", null, {
      rows: body.data.rows.length,
      inserted,
      skipped,
      errors: errors.length,
    });
    return created({ inserted, skipped, errors });
  } catch (err) {
    return serverError(err);
  }
}
