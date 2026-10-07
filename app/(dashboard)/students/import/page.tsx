"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSession } from "@/lib/client/session";
import { api } from "@/lib/client/api";
import {
  IMPORT_COLUMNS,
  REQUIRED_COLUMNS,
  buildTemplateCsv,
  parseImportFile,
  type ImportRow,
} from "@/lib/importParser";
import { ErrorNote, btnGhost, btnPrimary, inputCls } from "@/components/ui";

type ServerErrors = { row: number; message: string }[];

type DryRun = {
  dry_run: boolean;
  valid: ImportRow[];
  errors: ServerErrors;
  total: number;
};

type ImportResult = { inserted: number; skipped: number; errors: number };

const STEPS = ["Upload", "Preview", "Fix errors", "Confirm"];

function downloadTemplate() {
  const blob = new Blob([buildTemplateCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "students-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function StudentImportPage() {
  const { can } = useSession();
  const allowed = can("studentManager");

  const [step, setStep] = useState(0);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [serverErrors, setServerErrors] = useState<ServerErrors>([]);
  const [validatedCount, setValidatedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const invalidRows = useMemo(() => new Set(serverErrors.map((e) => e.row)), [serverErrors]);
  const editableRowIndexes = useMemo(
    () =>
      [...invalidRows]
        .map((rowNo) => rowNo - 1)
        .filter((i) => i >= 0 && i < rows.length)
        .sort((a, b) => a - b),
    [invalidRows, rows.length],
  );

  function reset() {
    setStep(0);
    setFileName("");
    setRows([]);
    setParseErrors([]);
    setServerErrors([]);
    setValidatedCount(0);
    setActionError(null);
    setResult(null);
  }

  async function onFile(file: File) {
    setActionError(null);
    setServerErrors([]);
    const parsed = await parseImportFile(file);
    setFileName(file.name);
    setParseErrors(parsed.errors);
    setRows(parsed.rows);
    if (parsed.errors.length === 0 && parsed.rows.length > 0) setStep(1);
  }

  function editCell(rowIndex: number, column: string, value: string) {
    setRows((prev) => prev.map((r, i) => (i === rowIndex ? { ...r, [column]: value } : r)));
    setValidatedCount(0);
  }

  async function validate() {
    setBusy(true);
    setActionError(null);
    const res = await api<DryRun>("/api/students/import", {
      method: "POST",
      json: { rows, dry_run: true },
    });
    setBusy(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setActionError(data.error ?? "Validation failed");
      return;
    }
    setServerErrors(res.data.errors ?? []);
    setValidatedCount(res.data.valid?.length ?? 0);
    setStep(2);
  }

  function removeInvalid() {
    setRows((prev) => prev.filter((_, i) => !invalidRows.has(i + 1)));
    setServerErrors([]);
    setValidatedCount(0);
    setActionError(null);
  }

  async function submit() {
    setBusy(true);
    setActionError(null);
    const res = await api<ImportResult>("/api/students/import", {
      method: "POST",
      json: { rows, dry_run: false },
    });
    setBusy(false);
    if (!res.ok) {
      const data = res.data as { error?: string };
      setActionError(data.error ?? "Import failed");
      return;
    }
    setResult(res.data);
    setStep(3);
  }

  if (!allowed) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Import students</h1>
        <ErrorNote message="Your role cannot import students." />
        <Link href="/students" className={btnGhost}>
          Back to students
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Import students</h1>
          <p className="text-sm text-muted">
            Upload a CSV or Excel file, preview it, fix errors, then confirm.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btnGhost} onClick={downloadTemplate}>
            Download template
          </button>
          <Link href="/students" className={btnGhost}>
            Cancel
          </Link>
        </div>
      </div>

      <ol className="flex flex-wrap gap-3 text-sm" aria-label="Import steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={step === i ? "step" : undefined}
            className={`flex items-center gap-2 rounded-full px-3 py-1 font-semibold ${
              step === i ? "bg-primary text-on-primary" : i < step ? "bg-tint text-primary" : "text-muted"
            }`}
          >
            <span aria-hidden="true">{i + 1}.</span> {label}
          </li>
        ))}
      </ol>

      {actionError && <ErrorNote message={actionError} />}

      {step === 0 && (
        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <div className="rounded-lg border-2 border-dashed border-line-strong p-8 text-center">
            <p className="text-sm font-semibold">Choose a .csv or .xlsx file</p>
            <p className="mt-1 text-xs text-muted">
              Required columns: {REQUIRED_COLUMNS.join(", ")}. Optional:{" "}
              {IMPORT_COLUMNS.filter((c) => !REQUIRED_COLUMNS.includes(c)).join(", ")}.
            </p>
            <label className="mt-4 inline-block cursor-pointer">
              <span className={`${btnPrimary} inline-block`}>Select file</span>
              <input
                type="file"
                accept=".csv,.xlsx,.xls,text/csv"
                className="sr-only"
                aria-label="Students file to import"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {parseErrors.length > 0 && <ErrorNote message={parseErrors.join(" ")} />}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <strong>{fileName}</strong> — {rows.length} row{rows.length === 1 ? "" : "s"} read
            </span>
            <span className="text-muted">Showing first 20 rows</span>
          </div>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted">
                  <th className="px-3 py-2">#</th>
                  {IMPORT_COLUMNS.map((c) => (
                    <th key={c} className="px-3 py-2">
                      {c.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.slice(0, 20).map((r, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-muted">{i + 1}</td>
                    {IMPORT_COLUMNS.map((c) => (
                      <td key={c} className="px-3 py-2">
                        {r[c] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={reset}>
              Back
            </button>
            <button type="button" className={btnPrimary} onClick={() => void validate()} disabled={busy}>
              {busy ? "Validating…" : "Validate rows"}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          {serverErrors.length > 0 ? (
            <>
              <div className="rounded-md border border-danger bg-danger-tint px-3 py-2 text-sm text-danger">
                {serverErrors.length} row{serverErrors.length === 1 ? "" : "s"} need
                {serverErrors.length === 1 ? "s" : ""} fixing before import.
              </div>
              <ul className="space-y-1 text-sm">
                {serverErrors.map((e) => (
                  <li key={e.row}>
                    <span className="font-semibold">Row {e.row}:</span> {e.message}
                  </li>
                ))}
              </ul>
              <div className="space-y-4">
                {editableRowIndexes.map((rowIndex) => (
                  <div key={rowIndex} className="rounded-md border border-line-strong p-3">
                    <div className="mb-2 text-xs font-semibold uppercase text-muted">
                      Edit row {rowIndex + 1}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {IMPORT_COLUMNS.map((c) => (
                        <label key={c} className="block text-xs">
                          <span className="mb-0.5 block font-medium">
                            {c.replace(/_/g, " ")}
                            {REQUIRED_COLUMNS.includes(c) && <span className="text-danger"> *</span>}
                          </span>
                          <input
                            className={inputCls}
                            value={rows[rowIndex]?.[c] ?? ""}
                            onChange={(e) => editCell(rowIndex, c, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : validatedCount > 0 ? (
            <div className="rounded-md border border-ok bg-ok-tint px-3 py-2 text-sm font-medium text-ok">
              All {validatedCount} rows passed validation.
            </div>
          ) : (
            <div className="rounded-md border border-line-strong bg-tint px-3 py-2 text-sm text-muted">
              Rows changed since the last check — run Re-validate to continue.
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={btnGhost} onClick={() => setStep(1)}>
              Back to preview
            </button>
            {serverErrors.length > 0 && (
              <button
                type="button"
                className={btnGhost}
                onClick={removeInvalid}
                disabled={invalidRows.size >= rows.length}
              >
                Drop invalid rows
              </button>
            )}
            <button
              type="button"
              className={btnGhost}
              onClick={() => void validate()}
              disabled={busy || rows.length === 0}
            >
              {busy ? "Re-validating…" : "Re-validate"}
            </button>
            <button
              type="button"
              className={btnPrimary}
              onClick={() => void submit()}
              disabled={busy || serverErrors.length > 0 || validatedCount === 0}
            >
              {busy ? "Importing…" : `Import ${validatedCount} students`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
          <div className="rounded-md border border-ok bg-ok-tint px-3 py-2 text-sm font-medium text-ok">
            Import finished: {result.inserted} inserted, {result.skipped} skipped
            {result.errors > 0 ? `, ${result.errors} failed` : ""}.
          </div>
          <p className="text-sm text-muted">
            Skipped rows are students that already exist with the same student number.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={btnGhost} onClick={reset}>
              Import another file
            </button>
            <Link href="/students" className={btnPrimary}>
              Go to students
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
