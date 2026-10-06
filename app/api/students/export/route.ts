import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/roles";
import { serverError } from "@/lib/api";
import { toCsv, csvResponse } from "@/lib/csv";
import { logAction } from "@/lib/audit";

const COLUMNS = [
  { key: "student_no", label: "Student No" },
  { key: "last_name", label: "Last Name" },
  { key: "first_name", label: "First Name" },
  { key: "middle_name", label: "Middle Name" },
  { key: "year_level", label: "Year Level" },
  { key: "course", label: "Course" },
  { key: "section", label: "Section" },
  { key: "status", label: "Status" },
  { key: "email", label: "Email" },
  { key: "contact_no", label: "Contact" },
  { key: "guardian_name", label: "Guardian" },
  { key: "guardian_contact", label: "Guardian Contact" },
];

// GET /api/students/export — CSV (studentManager)
export async function GET(req: NextRequest) {
  const auth = await requireRole("studentManager");
  if (auth.response) return auth.response;

  try {
    const db = createAdminClient();
    const sp = req.nextUrl.searchParams;

    let q = db.from("students").select("*");
    if (sp.get("trash") === "true") q = q.not("deleted_at", "is", null);
    else q = q.is("deleted_at", null);
    const year = sp.get("year_level");
    if (year) q = q.eq("year_level", Number(year));
    const status = sp.get("status");
    if (status) q = q.eq("status", status);
    const search = sp.get("q")?.trim();
    if (search) {
      const term = search.replace(/[%,()]/g, " ");
      q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,student_no.ilike.%${term}%`);
    }

    const { data, error } = await q
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .limit(10000);
    if (error) return serverError(error);

    await logAction(auth.profile.username, "export", "students", null, {
      rows: data?.length ?? 0,
    });
    return csvResponse(toCsv(data ?? [], COLUMNS), `students-${new Date().toISOString().slice(0, 10)}.csv`);
  } catch (err) {
    return serverError(err);
  }
}
