import Papa from "papaparse";
import * as XLSX from "xlsx";

export const IMPORT_COLUMNS = [
  "student_no",
  "first_name",
  "last_name",
  "middle_name",
  "year_level",
  "course",
  "section",
  "status",
  "email",
  "contact_no",
  "guardian_name",
  "guardian_contact",
] as const;

export const REQUIRED_COLUMNS = ["student_no", "first_name", "last_name", "year_level"];

export type ImportRow = Record<string, string>;

export type ParsedImport = {
  rows: ImportRow[];
  errors: string[];
};

export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeRowKeys(raw: Record<string, unknown>): ImportRow {
  const row: ImportRow = {};
  for (const [key, value] of Object.entries(raw)) {
    row[normalizeHeader(key)] = value == null ? "" : String(value).trim();
  }
  return row;
}

function isBlankRow(row: ImportRow): boolean {
  return Object.values(row).every((v) => v === "");
}

function finish(rows: ImportRow[], errors: string[]): ParsedImport {
  const kept = rows.filter((r) => !isBlankRow(r));
  if (kept.length === 0) {
    errors.push("The file has no data rows.");
  } else {
    const headers = new Set(Object.keys(kept[0]));
    const missing = REQUIRED_COLUMNS.filter((c) => !headers.has(c));
    if (missing.length > 0) {
      errors.push(`Missing required columns: ${missing.join(", ")}.`);
    }
  }
  return { rows: kept, errors };
}

async function parseCsv(file: File): Promise<ParsedImport> {
  const text = await file.text();
  return new Promise((resolve) => {
    Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: normalizeHeader,
      complete: (result) => {
        const errors: string[] = [];
        for (const err of result.errors) {
          if (err.type !== "FieldMismatch") continue;
          const rowNo = err.row == null ? "?" : err.row + 2;
          errors.push(`Row ${rowNo}: ${err.message}`);
        }
        const rows = result.data.map(normalizeRowKeys);
        resolve(finish(rows, errors));
      },
      error: (err: Error) =>
        resolve({ rows: [], errors: [`Could not read CSV: ${err.message}`] }),
    });
  });
}

async function parseWorkbook(file: File): Promise<ParsedImport> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return { rows: [], errors: ["The workbook has no sheets."] };
  const sheet = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return finish(raw.map(normalizeRowKeys), []);
}

export async function parseImportFile(file: File): Promise<ParsedImport> {
  try {
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv") || file.type === "text/csv") return await parseCsv(file);
    if (name.endsWith(".xlsx") || name.endsWith(".xls") || file.type.includes("sheet"))
      return await parseWorkbook(file);
    return { rows: [], errors: ["Unsupported file type. Use .csv or .xlsx."] };
  } catch (err) {
    return { rows: [], errors: [`Could not read file: ${err instanceof Error ? err.message : String(err)}`] };
  }
}

export function buildTemplateCsv(): string {
  const header = IMPORT_COLUMNS.join(",");
  const example = "2026-0001,Juan,Dela,Cruz,1,BSIT,A,,,,,,";
  return `${header}\n${example}\n`;
}
