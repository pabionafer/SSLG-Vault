import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

export const php = (n: number) =>
  `₱${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type SettingsMap = Record<string, string>;

export function parseSettings(
  rows: { key: string; value: unknown }[] | null,
): SettingsMap {
  const out: SettingsMap = {};
  for (const row of rows ?? []) {
    const raw = String(row.value ?? "");
    try {
      const parsed = JSON.parse(raw);
      out[row.key] = typeof parsed === "string" ? parsed : raw;
    } catch {
      out[row.key] = raw;
    }
  }
  return out;
}

export const S = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9,
    color: "#1d2b24",
    fontFamily: "Helvetica",
  },
  school: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  address: {
    fontSize: 9,
    color: "#5d6b63",
    textAlign: "center",
  },
  title: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginVertical: 12,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    marginBottom: 6,
  },
  meta: {
    fontSize: 9,
    color: "#5d6b63",
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginTop: 10,
    marginBottom: 4,
  },
  box: {
    borderWidth: 1,
    borderColor: "#d9d0b8",
    borderRadius: 4,
    padding: 8,
    marginVertical: 6,
  },
  label: {
    fontSize: 8,
    color: "#5d6b63",
    marginBottom: 2,
  },
  value: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e7dfc9",
    alignItems: "center",
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    color: "#5d6b63",
  },
  td: {
    fontSize: 9,
  },
  right: {
    textAlign: "right",
  },
  bold: {
    fontFamily: "Helvetica-Bold",
  },
  muted: {
    color: "#5d6b63",
  },
  amountBig: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    marginVertical: 6,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: "#5d6b63",
  },
});

export function SchoolHeader({
  settings,
  title,
}: {
  settings: SettingsMap;
  title: string;
}) {
  return (
    <>
      <Text style={S.school}>{settings.school_name || "SSLG College"}</Text>
      {settings.school_address ? <Text style={S.address}>{settings.school_address}</Text> : null}
      <Text style={S.title}>{title}</Text>
    </>
  );
}

export function DocFooter({ note }: { note: string }) {
  return (
    <View style={S.footer} fixed>
      <Text>{note}</Text>
      <Text>Generated {new Date().toISOString().slice(0, 16).replace("T", " ")} UTC</Text>
    </View>
  );
}

export type ReceiptDocProps = {
  receipt: {
    receipt_no: string;
    amount?: number;
    issued_at?: string;
    issued_by?: string | null;
    payment?: {
      payment_date?: string;
      mode?: string;
      amount?: number;
      reference_no?: string | null;
      academic_year?: string;
      semester?: string | null;
      student?: {
        student_no?: string;
        first_name?: string;
        last_name?: string;
        middle_name?: string | null;
        year_level?: number;
        course?: string | null;
        section?: string | null;
      } | null;
      fee?: { name?: string } | null;
    } | null;
  };
  settings: SettingsMap;
};

export function ReceiptDocument({ receipt, settings }: ReceiptDocProps) {
  const p = receipt.payment;
  const s = p?.student;
  const studentName = s
    ? [s.last_name, `${s.first_name ?? ""}${s.middle_name ? ` ${s.middle_name}.` : ""}`]
        .filter(Boolean)
        .join(", ")
    : "—";
  const mode = (p?.mode ?? "").replace("_", " ");
  return (
    <Document title={`Receipt ${receipt.receipt_no}`}>
      <Page size="A5" style={S.page}>
        <SchoolHeader settings={settings} title="OFFICIAL RECEIPT" />
        <View style={S.metaRow}>
          <Text style={S.meta}>OR No. {receipt.receipt_no}</Text>
          <Text style={S.meta}>Date {p?.payment_date ?? "—"}</Text>
        </View>
        <View style={S.box}>
          <Text style={S.label}>Received from</Text>
          <Text style={S.value}>{studentName}</Text>
          <Text style={S.muted}>
            {s?.student_no ? `Student No. ${s.student_no}` : ""}
            {s?.year_level ? `  ·  Year ${s.year_level}` : ""}
            {s?.course ? `  ·  ${s.course}` : ""}
            {s?.section ? ` ${s.section}` : ""}
          </Text>
          <Text style={[S.label, { marginTop: 6 }]}>For</Text>
          <Text style={S.value}>{p?.fee?.name ?? "Miscellaneous payment"}</Text>
          <Text style={[S.amountBig, { color: "#1f5c3f" }]}>
            {php(Number(receipt.amount ?? p?.amount ?? 0))}
          </Text>
          <Text style={S.muted}>
            Mode: {mode || "cash"}
            {p?.reference_no ? `  ·  Ref. ${p.reference_no}` : ""}
            {p?.academic_year ? `  ·  ${p.academic_year}` : ""}
            {p?.semester ? `  ·  ${p.semester}` : ""}
          </Text>
        </View>
        <View style={{ marginTop: 18, flexDirection: "row", justifyContent: "space-between" }}>
          <View>
            <Text style={S.label}>Prepared by</Text>
            <Text style={S.bold}>{receipt.issued_by ?? "—"}</Text>
          </View>
          <View>
            <Text style={[S.label, { textAlign: "right" }]}>Received by</Text>
            <Text style={S.bold}>{settings.treasurer_name || receipt.issued_by || "—"}</Text>
          </View>
        </View>
        <DocFooter note={`Receipt ${receipt.receipt_no} · valid when generated by SSLG Vault`} />
      </Page>
    </Document>
  );
}

export type DefaulterRowDoc = {
  student: { student_no?: string; first_name?: string; last_name?: string; year_level?: number };
  fee_name: string;
  balance: number;
  due_date?: string;
  days_overdue?: number;
};

export function DefaultersDocument({
  items,
  asOf,
  filters,
  settings,
}: {
  items: DefaulterRowDoc[];
  asOf: string;
  filters: string;
  settings: SettingsMap;
}) {
  const totalBalance = items.reduce((sum, d) => sum + Number(d.balance ?? 0), 0);
  return (
    <Document title="Defaulters Report">
      <Page size="A5" orientation="landscape" style={S.page}>
        <SchoolHeader settings={settings} title="DEFAULTERS REPORT" />
        <View style={S.metaRow}>
          <Text style={S.meta}>As of {asOf}</Text>
          <Text style={S.meta}>{filters}</Text>
          <Text style={S.meta}>
            {items.length} student{items.length === 1 ? "" : "s"} · {php(totalBalance)} total balance
          </Text>
        </View>
        <View style={[S.row, { borderBottomWidth: 1 }]}>
          <Text style={[S.th, { flex: 1.4 }]}>Student</Text>
          <Text style={[S.th, { flex: 0.5 }]}>Yr</Text>
          <Text style={[S.th, { flex: 1.6 }]}>Fee</Text>
          <Text style={[S.th, { flex: 1 }]}>Due</Text>
          <Text style={[S.th, { flex: 0.7, textAlign: "right" }]}>Days</Text>
          <Text style={[S.th, { flex: 1, textAlign: "right" }]}>Balance</Text>
        </View>
        {items.slice(0, 60).map((d, i) => (
          <View key={`${d.student.student_no}-${d.fee_name}-${i}`} style={S.row} wrap={false}>
            <Text style={[S.td, { flex: 1.4 }]}>
              {d.student.last_name ?? ""}, {d.student.first_name ?? ""}
              {d.student.student_no ? ` (${d.student.student_no})` : ""}
            </Text>
            <Text style={[S.td, { flex: 0.5 }]}>{d.student.year_level ?? "—"}</Text>
            <Text style={[S.td, { flex: 1.6 }]}>{d.fee_name}</Text>
            <Text style={[S.td, { flex: 1 }]}>{d.due_date ?? "—"}</Text>
            <Text style={[S.td, { flex: 0.7, textAlign: "right" }]}>{d.days_overdue ?? "—"}</Text>
            <Text style={[S.td, S.bold, { flex: 1, textAlign: "right" }]}>
              {php(Number(d.balance ?? 0))}
            </Text>
          </View>
        ))}
        {items.length > 60 && (
          <Text style={[S.muted, { marginTop: 6 }]}>
            Showing 60 of {items.length} entries.
          </Text>
        )}
        <DocFooter note="Defaulters Report · balances computed as of the date above" />
      </Page>
    </Document>
  );
}

export type MonthRow = { month: string; income: number; expenses: number };

export function FinancialReportDocument({
  totals,
  counts,
  byMonth,
  period,
  settings,
}: {
  totals: {
    total_payments: number;
    total_other_income: number;
    total_income: number;
    total_expenses: number;
    balance: number;
  };
  counts: { payments: number; income: number; expenses: number };
  byMonth: MonthRow[];
  period: string;
  settings: SettingsMap;
}) {
  return (
    <Document title="Financial Report">
      <Page size="A5" orientation="landscape" style={S.page}>
        <SchoolHeader settings={settings} title="FINANCIAL REPORT" />
        <Text style={S.meta}>{period}</Text>
        <View style={S.box}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Text style={S.label}>Total income</Text>
              <Text style={[S.value, { color: "#1f5c3f" }]}>{php(totals.total_income)}</Text>
            </View>
            <View>
              <Text style={S.label}>Total expenses</Text>
              <Text style={[S.value, { color: "#b3261e" }]}>{php(totals.total_expenses)}</Text>
            </View>
            <View>
              <Text style={S.label}>Balance</Text>
              <Text style={S.value}>{php(totals.balance)}</Text>
            </View>
            <View>
              <Text style={S.label}>Entries</Text>
              <Text style={S.value}>
                {counts.payments} payments · {counts.income} income · {counts.expenses} expenses
              </Text>
            </View>
          </View>
        </View>
        <Text style={S.sectionTitle}>By month</Text>
        <View style={[S.row, { borderBottomWidth: 1 }]}>
          <Text style={[S.th, { flex: 1.4 }]}>Month</Text>
          <Text style={[S.th, { flex: 1, textAlign: "right" }]}>Income</Text>
          <Text style={[S.th, { flex: 1, textAlign: "right" }]}>Expenses</Text>
          <Text style={[S.th, { flex: 1, textAlign: "right" }]}>Net</Text>
        </View>
        {byMonth.map((m) => (
          <View key={m.month} style={S.row} wrap={false}>
            <Text style={[S.td, { flex: 1.4 }]}>{m.month}</Text>
            <Text style={[S.td, { flex: 1, textAlign: "right" }]}>{php(m.income)}</Text>
            <Text style={[S.td, { flex: 1, textAlign: "right" }]}>{php(m.expenses)}</Text>
            <Text style={[S.td, S.bold, { flex: 1, textAlign: "right" }]}>
              {php(m.income - m.expenses)}
            </Text>
          </View>
        ))}
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
          <Text style={S.muted}>
            Payments {php(totals.total_payments)} + other income {php(totals.total_other_income)}
          </Text>
          {settings.treasurer_name ? <Text style={S.muted}>Treasurer: {settings.treasurer_name}</Text> : null}
        </View>
        <DocFooter note="Financial Report · amounts in PHP" />
      </Page>
    </Document>
  );
}

export function pdfResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
