import { useMemo, useState } from "react";
import { Truck, Plus, Trash2, Package, Info } from "lucide-react";
import { useApp } from "../app-provider";
import { AddItemModal } from "./inventory-section";
import { Card, SectionHeader } from "../ui-kit";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  quantity: string;
  buyPrice: string;
  targetMargin: string;
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

const FEE_RATE = 0.05;

const emptyRow = (): Row => ({
  id: uid(),
  name: "",
  quantity: "1",
  buyPrice: "",
  targetMargin: "5",
});

export function ShippingSection() {
  const { t, lang } = useApp();
  const [totalPaid, setTotalPaid] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [prefillFor, setPrefillFor] = useState<
    | (Row & {
        qty: number;
        buy: number;
        margin: number;
        costTotal: number;
        suggested: number;
        netAtSuggested: number;
      })
    | null
  >(null);

  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (id: string) =>
    setRows((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : r));
  const updateRow = (id: string, patch: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const total = Number(totalPaid) || 0;
  // buy price entered is per unit — the known cost of a row is buyPrice × quantity
  const knownSum = rows.reduce(
    (s, r) => s + (Number(r.buyPrice) || 0) * Math.max(1, Number(r.quantity) || 1),
    0,
  );
  const shippingTotal = Math.max(0, total - knownSum);
  const shippingShare = rows.length > 0 ? shippingTotal / rows.length : 0;
  const overBudget = total > 0 && knownSum > total;

  const computed = useMemo(
    () =>
      rows.map((r) => {
        const qty = Math.max(1, Number(r.quantity) || 1);
        const buy = Number(r.buyPrice) || 0;
        const margin = Number(r.targetMargin) || 0;
        const shippingPerUnit = shippingShare / qty;
        const costTotal = buy * qty + shippingShare;
        // per-unit sellPrice such that sellPrice*(1-fee) - buy - shippingPerUnit = margin (per unit)
        const suggested = (margin + buy + shippingPerUnit) / (1 - FEE_RATE);
        const netAtSuggested = suggested * (1 - FEE_RATE) * qty - buy * qty - shippingShare;
        return { ...r, qty, buy, margin, costTotal, suggested, netAtSuggested };
      }),
    [rows, shippingShare],
  );

  const anyNamed = computed.some((r) => r.name.trim());

  return (
    <div className="space-y-6">
      <SectionHeader title={t("ship.title")} subtitle={t("ship.subtitle")} />

      <Card className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">{t("ship.totalPaid")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={totalPaid}
              onChange={(e) => setTotalPaid(e.target.value)}
              placeholder="30"
              className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="flex items-end gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>{t("ship.hint")}</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="hidden grid-cols-[1.2fr_0.5fr_0.7fr_0.7fr_auto] gap-3 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
            <span>{t("ship.col.article")}</span>
            <span>{t("ship.col.qty")}</span>
            <span>{t("ship.col.buy")}</span>
            <span>{t("ship.col.margin")}</span>
            <span />
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/20 p-2 sm:grid-cols-[1.2fr_0.5fr_0.7fr_0.7fr_auto] sm:border-0 sm:bg-transparent sm:p-0"
            >
              <input
                value={r.name}
                onChange={(e) => updateRow(r.id, { name: e.target.value })}
                placeholder={t("ship.col.article.placeholder")}
                className="col-span-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 sm:col-span-1"
              />
              <input
                type="number"
                min="1"
                step="1"
                value={r.quantity}
                onChange={(e) => updateRow(r.id, { quantity: e.target.value })}
                placeholder="1"
                title={t("ship.col.qty")}
                className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={r.buyPrice}
                onChange={(e) => updateRow(r.id, { buyPrice: e.target.value })}
                placeholder="10"
                title={t("ship.col.buy")}
                className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={r.targetMargin}
                onChange={(e) => updateRow(r.id, { targetMargin: e.target.value })}
                placeholder="5"
                title={t("ship.col.margin")}
                className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
              <button
                type="button"
                onClick={() => removeRow(r.id)}
                disabled={rows.length === 1}
                className="grid place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <Plus className="size-3.5" />
            {t("ship.addArticle")}
          </button>
        </div>

        {overBudget ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {t("ship.overBudget")}
          </p>
        ) : null}
      </Card>

      {/* Results */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <Truck className="size-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">{t("ship.results")}</p>
              <p className="text-xs text-muted-foreground">
                {t("ship.shippingTotal")}:{" "}
                <span className="text-foreground">{formatCurrency(shippingTotal, lang)}</span>
                {" · "}
                {t("ship.perArticle")}:{" "}
                <span className="text-foreground">{formatCurrency(shippingShare, lang)}</span>
              </p>
            </div>
          </div>
        </div>
        <div className="hidden grid-cols-[1.2fr_0.5fr_1fr_1fr_1fr_1fr_auto] gap-3 border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <span>{t("ship.col.article")}</span>
          <span>{t("ship.col.qty")}</span>
          <span>{t("ship.result.cost")}</span>
          <span>{t("ship.result.shippingShare")}</span>
          <span>{t("ship.result.suggested")}</span>
          <span>{t("ship.result.netProfit")}</span>
          <span />
        </div>
        <ul>
          {computed.map((r, i) => (
            <li
              key={r.id}
              className="grid grid-cols-2 gap-2 border-b border-border/60 px-4 py-3 last:border-0 md:grid-cols-[1.2fr_0.5fr_1fr_1fr_1fr_1fr_auto] md:items-center"
            >
              <span className="col-span-2 truncate text-sm font-medium text-foreground md:col-span-1">
                {r.name.trim() || `${t("ship.col.article.placeholder")} ${i + 1}`}
              </span>
              <span className="text-sm text-muted-foreground">×{r.qty}</span>
              <span className="text-sm text-muted-foreground">
                {formatCurrency(r.costTotal, lang)}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatCurrency(shippingShare / r.qty, lang)}
                {r.qty > 1 ? ` /u` : ""}
              </span>
              <span className="text-sm font-semibold text-primary">
                {formatCurrency(Math.max(0, r.suggested), lang)}
                {r.qty > 1 ? ` /u` : ""}
              </span>
              <span
                className={cn(
                  "text-sm",
                  r.netAtSuggested >= 0 ? "text-muted-foreground" : "text-destructive",
                )}
              >
                {formatCurrency(r.netAtSuggested, lang)}
              </span>
              <button
                type="button"
                onClick={() => setPrefillFor(r)}
                className="inline-flex items-center gap-1 justify-self-start rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary md:justify-self-end"
              >
                <Package className="size-3.5" />
                {t("ship.sendToInventory")}
              </button>
            </li>
          ))}
        </ul>
        {!anyNamed ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">{t("ship.namePrompt")}</p>
        ) : null}
      </Card>

      {prefillFor ? (
        <PrefillModal
          row={prefillFor}
          shippingShare={shippingShare}
          onClose={() => setPrefillFor(null)}
        />
      ) : null}
    </div>
  );
}

function PrefillModal({
  row,
  shippingShare,
  onClose,
}: {
  row: { name: string; qty: number; buy: number; suggested: number };
  shippingShare: number;
  onClose: () => void;
}) {
  const { addItem } = useApp();
  return (
    <AddItemModal
      onClose={onClose}
      onAdd={addItem}
      initial={{
        name: row.name,
        buyPrice: row.buy,
        sellPrice: Math.round(Math.max(0, row.suggested) * 100) / 100,
        shippingFee: Math.round(shippingShare * 100) / 100,
        quantity: row.qty,
      }}
    />
  );
}
