import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Receipt,
  FileText,
  FileSpreadsheet,
  FileDown,
  Plus,
  Trash2,
  Wallet,
  Landmark,
  Percent,
  TrendingUp,
} from "lucide-react";
import { useApp, useMetrics } from "../app-provider";
import { Card, SectionHeader } from "../ui-kit";
import { formatCurrency } from "@/lib/format";

export function AccountingSection() {
  const { t, lang, expenses, addExpense, removeExpense } = useApp();
  const m = useMetrics();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");

  const rows = [
    { label: t("acc.gross"), value: m.revenue },
    { label: t("acc.fees"), value: -m.platformFees },
    { label: t("acc.shipping"), value: -m.shipping },
    { label: t("acc.expenses"), value: -m.expenseTotal },
    { label: t("acc.urssaf"), value: -m.urssaf },
  ];

  const submit = () => {
    const amt = Number(amount);
    if (!label.trim() || !amt) return;
    addExpense(label.trim(), amt);
    setLabel("");
    setAmount("");
  };

  const summaryRows = () => [
    [t("acc.gross"), m.revenue.toFixed(2)],
    [t("acc.fees"), m.platformFees.toFixed(2)],
    [t("acc.urssaf"), m.urssaf.toFixed(2)],
    [t("acc.expenses"), m.expenseTotal.toFixed(2)],
    [t("acc.net"), m.netProfit.toFixed(2)],
  ];

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const lines = [
      ["ResellFlow", "Export"],
      ...summaryRows(),
      [],
      [t("acc.expense.label"), t("acc.expense.amount")],
      ...expenses.map((e) => [e.label, e.amount.toFixed(2)]),
    ];
    const csv = lines.map((l) => l.join(";")).join("\n");
    download(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }),
      "resellflow-comptabilite.csv",
    );
  };

  const exportExcel = () => {
    // A real spreadsheet file (Excel/LibreOffice open this natively), distinct from the CSV export.
    const escapeCell = (v: string) => `<td>${v.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`;
    const summaryHtml = summaryRows()
      .map((row) => `<tr>${escapeCell(row[0] ?? "")}${escapeCell(row[1] ?? "")}</tr>`)
      .join("");
    const expensesHtml = expenses
      .map((e) => `<tr>${escapeCell(e.label)}${escapeCell(e.amount.toFixed(2))}</tr>`)
      .join("");
    const html = `<html><head><meta charset="utf-8"></head><body>
      <table border="1">
        <tr><th colspan="2">ResellFlow — ${t("acc.title")}</th></tr>
        ${summaryHtml}
      </table>
      <br/>
      <table border="1">
        <tr><th>${t("acc.expense.label")}</th><th>${t("acc.expense.amount")}</th></tr>
        ${expensesHtml}
      </table>
    </body></html>`;
    download(
      new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" }),
      "resellflow-comptabilite.xls",
    );
  };

  return (
    <div className="space-y-6">
      <SectionHeader title={t("acc.title")} subtitle={t("acc.subtitle")} />

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          icon={Wallet}
          label={t("acc.gross")}
          value={formatCurrency(m.revenue, lang)}
          accent="text-foreground"
        />
        <SummaryCard
          icon={Percent}
          label={t("acc.fees")}
          value={formatCurrency(m.platformFees, lang)}
          accent="text-muted-foreground"
        />
        <SummaryCard
          icon={Landmark}
          label={t("acc.urssaf")}
          value={formatCurrency(m.urssaf, lang)}
          accent="text-amber-300"
        />
        <SummaryCard
          icon={TrendingUp}
          label={t("acc.net")}
          value={formatCurrency(m.netProfit, lang)}
          accent="text-primary"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Breakdown */}
        <Card className="p-5 lg:col-span-3">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-semibold text-foreground">{t("acc.title")}</h2>
            <div className="flex flex-wrap gap-2">
              <ExportBtn
                icon={FileText}
                label={t("acc.export.pdf")}
                onClick={() => window.print()}
              />
              <ExportBtn icon={FileDown} label={t("acc.export.csv")} onClick={exportCsv} />
              <ExportBtn
                icon={FileSpreadsheet}
                label={t("acc.export.excel")}
                onClick={exportExcel}
              />
            </div>
          </div>
          <ul className="divide-y divide-border/60">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center justify-between py-3">
                <span className="text-sm text-muted-foreground">{r.label}</span>
                <span className="text-sm font-medium text-foreground">
                  {formatCurrency(r.value, lang)}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between border-t-2 border-primary/30 pt-3">
              <span className="text-sm font-semibold text-foreground">{t("acc.net")}</span>
              <span className="nums text-lg font-semibold text-primary">
                {formatCurrency(m.netProfit, lang)}
              </span>
            </li>
          </ul>
        </Card>

        {/* Expenses */}
        <Card className="p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Receipt className="size-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">{t("acc.expenses")}</h2>
          </div>

          <div className="mb-4 space-y-2">
            <input
              className={inputCls}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("acc.expense.label")}
            />
            <div className="flex gap-2">
              <input
                className={inputCls}
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t("acc.expense.amount")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
                }}
              />
              <button
                type="button"
                onClick={submit}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>

          {expenses.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-6 text-center text-xs text-muted-foreground">
              {t("acc.empty")}
            </p>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence>
                {expenses.map((e) => (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-3 py-2"
                  >
                    <span className="truncate text-sm text-foreground">{e.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-sm font-medium text-destructive">
                        -{formatCurrency(e.amount, lang)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeExpense(e.id)}
                        className="grid size-6 place-items-center rounded text-muted-foreground transition hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/20";

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <Card className="p-4">
      <span className="mb-3 grid size-9 place-items-center rounded-lg bg-secondary text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <p className={`nums text-lg font-semibold ${accent}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}

function ExportBtn({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof FileText;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}
