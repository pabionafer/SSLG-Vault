"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/client/session";
import { useToast } from "@/lib/client/toast";
import { api } from "@/lib/client/api";
import {
  Badge,
  Confirm,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Pagination,
  Spinner,
  btnGhost,
  btnPrimary,
  inputCls,
} from "@/components/ui";

interface Student {
  id: number;
  student_no: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  year_level: number;
  course: string | null;
  section: string | null;
  status: string;
}

interface StudentForm {
  student_no: string;
  first_name: string;
  last_name: string;
  middle_name: string;
  year_level: number;
  course: string;
  section: string;
  status: string;
}

const EMPTY_FORM: StudentForm = {
  student_no: "",
  first_name: "",
  last_name: "",
  middle_name: "",
  year_level: 1,
  course: "",
  section: "",
  status: "enrolled",
};

const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  enrolled: "ok",
  graduated: "neutral",
  transferred: "warn",
  dropped: "danger",
};

export default function StudentsPage() {
  const { can } = useSession();
  const { push } = useToast();
  const canManage = can("studentManager");

  const [rows, setRows] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [yearLevel, setYearLevel] = useState("");
  const [status, setStatus] = useState("");
  const limit = 25;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [form, setForm] = useState<StudentForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Student | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (q.trim()) params.set("q", q.trim());
    if (yearLevel) params.set("year_level", yearLevel);
    if (status) params.set("status", status);
    const res = await api<{ items: Student[]; total: number }>(`/api/students?${params}`);
    if (res.ok) {
      setRows(res.data.items ?? []);
      setTotal(res.data.total ?? 0);
      setError(null);
    } else if (res.status !== 401) {
      setError("Could not load students");
    }
    setLoading(false);
  }, [page, q, yearLevel, status]);

  useEffect(() => {
    const t = window.setTimeout(load, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(student: Student) {
    setEditing(student);
    setForm({
      student_no: student.student_no,
      first_name: student.first_name,
      last_name: student.last_name,
      middle_name: student.middle_name ?? "",
      year_level: student.year_level,
      course: student.course ?? "",
      section: student.section ?? "",
      status: student.status,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function save() {
    setSaving(true);
    setFormError(null);
    const payload = {
      student_no: form.student_no.trim(),
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      middle_name: form.middle_name.trim() || null,
      year_level: Number(form.year_level),
      course: form.course.trim() || null,
      section: form.section.trim() || null,
      status: form.status,
    };
    const res = editing
      ? await api(`/api/students/${editing.id}`, { method: "PATCH", json: payload })
      : await api("/api/students", { method: "POST", json: payload });
    setSaving(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setFormError(data.error ?? "Could not save student");
      return;
    }
    setFormOpen(false);
    push("success", editing ? "Student updated" : "Student added");
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    const res = await api(`/api/students/${deleting.id}`, { method: "DELETE" });
    setBusy(false);
    setDeleting(null);
    if (res.ok) {
      push("success", "Student moved to Trash");
      load();
    } else {
      const data = res.data as { error?: string };
      push("error", data.error ?? "Could not delete student");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Students</h1>
          <p className="text-sm text-muted">{total} student records</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Link href="/api/students/export" className={btnGhost}>
              Export CSV
            </Link>
          )}
          {canManage && (
            <Link href="/students/import" className={btnGhost}>
              Import
            </Link>
          )}
          {canManage && (
            <button type="button" className={btnPrimary} onClick={openCreate}>
              Add student
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
          placeholder="Search name or student no…"
          aria-label="Search students"
          className={`${inputCls} max-w-xs`}
        />
        <select
          value={yearLevel}
          onChange={(e) => {
            setPage(1);
            setYearLevel(e.target.value);
          }}
          aria-label="Year level"
          className={`${inputCls} w-40`}
        >
          <option value="">All years</option>
          {[1, 2, 3, 4, 5, 6].map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
          aria-label="Status"
          className={`${inputCls} w-44`}
        >
          <option value="">All statuses</option>
          <option value="enrolled">Enrolled</option>
          <option value="graduated">Graduated</option>
          <option value="transferred">Transferred</option>
          <option value="dropped">Dropped</option>
        </select>
      </div>

      {error && <ErrorNote message={error} />}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-3 py-2">Student No</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Year</th>
              <th className="px-3 py-2">Course / Section</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={6}>
                  <Spinner />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <EmptyState message="No students match these filters." />
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="hover:bg-tint/40">
                  <td className="px-3 py-2 font-mono text-xs">{s.student_no}</td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/students/${s.id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {s.last_name}, {s.first_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{s.year_level}</td>
                  <td className="px-3 py-2">
                    {s.course ?? "—"}
                    {s.section ? ` · ${s.section}` : ""}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONE[s.status] ?? "neutral"}>{s.status}</Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <Link href={`/students/${s.id}`} className="text-primary hover:underline">
                        View
                      </Link>
                      {canManage && (
                        <>
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => openEdit(s)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-danger hover:underline"
                            onClick={() => setDeleting(s)}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <Pagination page={page} limit={limit} total={total} onPage={setPage} />
      </div>

      <Modal
        open={formOpen}
        title={editing ? "Edit student" : "Add student"}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <button type="button" className={btnGhost} onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && <ErrorNote message={formError} />}
          <Field label="Student number" htmlFor="student_no">
            <input
              id="student_no"
              className={inputCls}
              value={form.student_no}
              onChange={(e) => setForm({ ...form, student_no: e.target.value })}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name" htmlFor="first_name">
              <input
                id="first_name"
                className={inputCls}
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                required
              />
            </Field>
            <Field label="Last name" htmlFor="last_name">
              <input
                id="last_name"
                className={inputCls}
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Middle name" htmlFor="middle_name">
              <input
                id="middle_name"
                className={inputCls}
                value={form.middle_name}
                onChange={(e) => setForm({ ...form, middle_name: e.target.value })}
              />
            </Field>
            <Field label="Year level" htmlFor="year_level">
              <select
                id="year_level"
                className={inputCls}
                value={form.year_level}
                onChange={(e) => setForm({ ...form, year_level: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5, 6].map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Course" htmlFor="course">
              <input
                id="course"
                className={inputCls}
                value={form.course}
                onChange={(e) => setForm({ ...form, course: e.target.value })}
              />
            </Field>
            <Field label="Section" htmlFor="section">
              <input
                id="section"
                className={inputCls}
                value={form.section}
                onChange={(e) => setForm({ ...form, section: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Status" htmlFor="status">
            <select
              id="status"
              className={inputCls}
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="enrolled">Enrolled</option>
              <option value="graduated">Graduated</option>
              <option value="transferred">Transferred</option>
              <option value="dropped">Dropped</option>
            </select>
          </Field>
        </div>
      </Modal>

      <Confirm
        open={deleting !== null}
        title="Delete student"
        message={
          deleting
            ? `Move ${deleting.last_name}, ${deleting.first_name} to Trash? You can restore it later.`
            : ""
        }
        confirmLabel="Move to Trash"
        danger
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
