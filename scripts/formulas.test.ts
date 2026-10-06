import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feeAppliesToStudent,
  paymentStatus,
  balanceDue,
  isClearanceEligible,
  computeDefaulters,
  reportTotals,
  yearlyBalances,
  type LedgerRow,
} from "../lib/formulas.ts";

// --- §7.1 Fee targeting -----------------------------------------------------
test("empty target set applies to every student", () => {
  assert.equal(feeAppliesToStudent({ id: 1, year_level: 1 }, []), true);
  assert.equal(feeAppliesToStudent({ id: 2, year_level: 4 }, []), true);
});

test("year-level and student targets are honoured", () => {
  const targets = [{ year_level: 2 }, { student_id: 7 }];
  assert.equal(feeAppliesToStudent({ id: 1, year_level: 2 }, targets), true);
  assert.equal(feeAppliesToStudent({ id: 7, year_level: 5 }, targets), true);
  assert.equal(feeAppliesToStudent({ id: 8, year_level: 3 }, targets), false);
});

// --- §7.2 Payment status ----------------------------------------------------
test("worked example: 1000 due → Paid / Partial / Unpaid", () => {
  assert.equal(paymentStatus(1000, 1000), "Paid");
  assert.equal(paymentStatus(999.99, 1000), "Paid"); // within 0.01 tolerance
  assert.equal(paymentStatus(450, 1000), "Partial");
  assert.equal(paymentStatus(0, 1000), "Unpaid");
  assert.equal(balanceDue(450, 1000), 550);
  assert.equal(balanceDue(999.99, 1000), 0);
});

// --- §7.3 Clearance eligibility --------------------------------------------
test("worked example: clearance needs every fee Paid", () => {
  assert.equal(isClearanceEligible(["Paid", "Paid", "Paid"]), true);
  assert.equal(isClearanceEligible(["Paid", "Partial", "Paid"]), false);
  assert.equal(isClearanceEligible([]), true); // no blocking fees
});

// --- §7.4 Defaulters --------------------------------------------------------
test("worked example: past-due partial payment is a defaulter", () => {
  const rows = [
    {
      student: { id: 1, year_level: 1, full_name: "Ana Cruz" },
      fee_id: 10,
      fee_name: "Tuition Fee",
      amount_due: 5000,
      amount_paid: 2000,
      due_date: "2026-09-15",
    },
    {
      student: { id: 2, year_level: 1, full_name: "Ben Santos" },
      fee_id: 10,
      fee_name: "Tuition Fee",
      amount_due: 5000,
      amount_paid: 5000,
      due_date: "2026-09-15",
    },
    {
      student: { id: 3, year_level: 1, full_name: "Cara Reyes" },
      fee_id: 11,
      fee_name: "Athletic Fee",
      amount_due: 500,
      amount_paid: 0,
      due_date: "2026-12-01",
    },
  ];
  const result = computeDefaulters(rows, "2026-10-07");
  assert.equal(result.length, 1);
  assert.equal(result[0].student.full_name, "Ana Cruz");
  assert.equal(result[0].balance, 3000);
  assert.equal(result[0].days_overdue, 22);
});

// --- §7.5 Financial report totals ------------------------------------------
test("worked example: report totals and balance", () => {
  const totals = reportTotals({
    payments: [5000, 1500.5], // tuition collections
    other_income: [200], // donations
    expenses: [1200.25, 300],
  });
  assert.equal(totals.total_payments, 6500.5);
  assert.equal(totals.total_other_income, 200);
  assert.equal(totals.total_income, 6700.5);
  assert.equal(totals.total_expenses, 1500.25);
  assert.equal(totals.balance, 5200.25);
});

// --- §7.6 Yearly balance ----------------------------------------------------
test("yearly balance groups rows per academic year", () => {
  const rows: LedgerRow[] = [
    { academic_year: "2026-2027", kind: "payment", amount: 1000 },
    { academic_year: "2026-2027", kind: "expense", amount: 400 },
    { academic_year: "2025-2026", kind: "payment", amount: 800 },
    { academic_year: "2026-2027", kind: "income", amount: 100 },
    { academic_year: "2025-2026", kind: "expense", amount: 900 },
  ];
  const out = yearlyBalances(rows);
  assert.deepEqual(out, [
    { academic_year: "2025-2026", total_income: 800, total_expenses: 900, balance: -100 },
    { academic_year: "2026-2027", total_income: 1100, total_expenses: 400, balance: 700 },
  ]);
});
