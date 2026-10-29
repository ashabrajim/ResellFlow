import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calculator,
  ClipboardCopy,
  Coins,
  Package,
  Percent,
  Plus,
  Trash2,
  TrendingUp,
  Truck,
  Weight,
} from "lucide-react";
import { useApp } from "../app-provider";
import { Card, SectionHeader, useToast } from "../ui-kit";
import { Switch } from "../ui/switch";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  qty: string;
  priceYuan: string;
  weightG: string;
  resale: string;
};

const uid = () => Math.random().toString(36).slice(2, 9);
const emptyRow = (): Row => ({
  id: uid(),
  name: "",
  qty: "1",
  priceYuan: "",
  weightG: "",
  resale: "",
});

// "Agent privé" flat rate grid — one rate per weight bracket, applied to the
// entire shipment weight (not a manual per-kg entry). The 1–3kg bracket
// covers the gap between the given "2 kg" and "3 kg (inclus)" figures so
// there's no unpriced range; adjust here if your agent's real breakpoint
// differs.
const PRIVATE_AGENT_TIERS = [
  { max: 1, rate: 19.1, labelKey: "profit.agent.tier1" as const },
  { max: 3, rate: 13.0, labelKey: "profit.agent.tier2" as const },
  { max: 5, rate: 9.55, labelKey: "profit.agent.tier3" as const },
  { max: 10, rate: 9.19, labelKey: "profit.agent.tier4" as const },
];

function privateAgentRate(kg: number) {
  if (kg <= 0) return 0;
  const tier = PRIVATE_AGENT_TIERS.find((t) => kg <= t.max);
  const lastTier = PRIVATE_AGENT_TIERS[PRIVATE_AGENT_TIERS.length - 1];
  return tier ? tier.rate : (lastTier?.rate ?? 0);
}

export function ProfitSection() {
  const { t, lang, addItem } = useApp();
  const { push } = useToast();

  const [rate, setRate] = useState("7.6");
  const [model, setModel] = useState<"tiers" | "kg">("tiers");
  const [firstTier, setFirstTier] = useState("20");
  const [nextTier, setNextTier] = useState("10");
  const [perKg, setPerKg] = useState("12");
  const [fixedFees, setFixedFees] = useState("3");
  const [privateAgent, setPrivateAgent] = useState(false);
  const [manualWeightKg, setManualWeightKg] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);

  const addRow = () => setRows((r) => [...r, emptyRow()]);
  const removeRow = (id: string) =>
    setRows((r) => (r.length > 1 ? r.filter((x) => x.id !== id) : [emptyRow()]));
  const update = (id: string, patch: Partial<Row>) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const data = useMemo(() => {
    const conv = Number(rate) || 1;
    const fees = Number(fixedFees) || 0;

    const parsed = rows.map((r) => {
      const qty = Math.max(1, Number(r.qty) || 1);
      const unitWeight = Math.max(0, Number(r.weightG) || 0);
      return {
        ...r,
        qty,
        unitWeight,
        totalWeight: unitWeight * qty,
        unitBuyEur: (Number(r.priceYuan) || 0) / conv,
        resaleEur: Number(r.resale) || 0,
      };
    });

    const totalWeightG = parsed.reduce((s, r) => s + r.totalWeight, 0);
    const computedKg = totalWeightG / 1000;
    const manualKg = Number(manualWeightKg) || 0;
    // Manual weight (when Agent privé is on) only picks the rate bracket —
    // the per-item allocation below always uses each item's real weight, so
    // the sum of per-item shipping still equals the shipping total exactly.
    const kg = privateAgent && manualKg > 0 ? manualKg : computedKg;

    let transport = 0;
    if (privateAgent) {
      if (kg > 0) transport = kg * privateAgentRate(kg);
    } else if (totalWeightG > 0) {
      if (model === "kg") {
        transport = kg * (Number(perKg) || 0);
      } else {
        const slices = Math.max(1, Math.ceil(kg / 0.5));
        transport = (Number(firstTier) || 0) + (slices - 1) * (Number(nextTier) || 0);
      }
    }
    const shippingTotal = transport + fees;
    const perGram = totalWeightG > 0 ? shippingTotal / totalWeightG : 0;

    const items = parsed.map((r) => {
      const shipUnit = perGram * r.unitWeight;
      const unitCost = r.unitBuyEur + shipUnit;
      const unitProfit = r.resaleEur - unitCost;
      const profitTotal = unitProfit * r.qty;
      const margin = r.resaleEur > 0 ? (unitProfit / r.resaleEur) * 100 : 0;
      return { ...r, shipUnit, unitCost, costTotal: unitCost * r.qty, profitTotal, margin };
    });

    const investment = items.reduce((s, r) => s + r.costTotal, 0);
    const revenue = items.reduce((s, r) => s + r.resaleEur * r.qty, 0);
    const profit = items.reduce((s, r) => s + r.profitTotal, 0);
    const avgMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

    return { items, totalWeightG, kg, computedKg, shippingTotal, investment, profit, avgMargin };
  }, [rows, rate, model, firstTier, nextTier, perKg, fixedFees, privateAgent, manualWeightKg]);

  const copySheets = async () => {
    const header = [
      t("profit.col.item"),
      t("profit.col.qty"),
      t("profit.col.priceYuan"),
      t("profit.col.weight"),
      t("profit.col.resale"),
      t("profit.col.shipUnit"),
      t("profit.col.cost"),
      t("profit.col.profit"),
      t("profit.col.margin"),
    ];
    const lines = [
      header.join("\t"),
      ...data.items.map((r, i) =>
        [
          r.name.trim() || `${t("profit.col.item")} ${i + 1}`,
          r.qty,
          r.priceYuan || "0",
          r.unitWeight,
          r.resaleEur.toFixed(2),
          r.shipUnit.toFixed(2),
          r.unitCost.toFixed(2),
          r.profitTotal.toFixed(2),
          `${r.margin.toFixed(1)}%`,
        ].join("\t"),
      ),
      "",
      [t("profit.kpi.weight"), `${data.kg.toFixed(2)} kg`].join("\t"),
      [t("profit.kpi.shipping"), data.shippingTotal.toFixed(2)].join("\t"),
      [t("profit.kpi.invest"), data.investment.toFixed(2)].join("\t"),
      [t("profit.kpi.profit"), data.profit.toFixed(2)].join("\t"),
      [t("profit.kpi.margin"), `${data.avgMargin.toFixed(1)}%`].join("\t"),
    ];
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    push("success", t("profit.copied"));
  };

  return (
    <div className="space-y-6">
      <SectionHeader title={t("profit.title")} subtitle={t("profit.subtitle")} />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={copySheets}
          className="inline-flex items-center gap-2 rounded-lg bg-success px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
        >
          <ClipboardCopy className="size-4" />
          {t("profit.copy")}
        </button>
      </div>

      {/* Settings */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="space-y-2 p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("profit.rate.title")}</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">1 € =</span>
            <input
              className={inputCls}
              type="number"
              min="0.1"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">¥</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("profit.rate.hint")}</p>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">{t("profit.model.title")}</h2>
            <label className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t("profit.agent.label")}
              </span>
              <Switch checked={privateAgent} onCheckedChange={setPrivateAgent} />
            </label>
          </div>

          {privateAgent ? (
            <div className="space-y-3">
              <Field
                label={t("profit.agent.weight")}
                value={manualWeightKg}
                onChange={setManualWeightKg}
                placeholder={
                  data.computedKg > 0
                    ? data.computedKg.toFixed(2)
                    : t("profit.agent.weight.placeholder")
                }
              />
              <p className="text-xs text-muted-foreground">{t("profit.agent.hint")}</p>
              <div className="space-y-1.5 rounded-lg border border-border bg-secondary/30 p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("profit.agent.grid")}
                </p>
                {PRIVATE_AGENT_TIERS.map((tier) => {
                  const active =
                    data.kg > 0 && data.kg <= tier.max && privateAgentRate(data.kg) === tier.rate;
                  return (
                    <div
                      key={tier.max}
                      className={cn(
                        "flex items-center justify-between rounded-md px-2 py-1 text-xs",
                        active
                          ? "bg-primary/10 font-semibold text-primary"
                          : "text-muted-foreground",
                      )}
                    >
                      <span>{t(tier.labelKey)}</span>
                      <span>{tier.rate.toFixed(2)} €/kg</span>
                    </div>
                  );
                })}
              </div>
              {data.kg > 0 ? (
                <p className="text-xs font-medium text-primary">
                  {t("profit.agent.applied", { rate: privateAgentRate(data.kg).toFixed(2) })}
                </p>
              ) : null}
              {data.kg > 10 ? (
                <p className="text-[11px] text-amber-700">{t("profit.agent.over10")}</p>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex rounded-lg border border-border bg-secondary/40 p-1 text-xs">
                {(["tiers", "kg"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1.5 font-medium transition",
                      model === m
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "tiers" ? t("profit.model.tiers") : t("profit.model.perKg")}
                  </button>
                ))}
              </div>
              {model === "tiers" ? (
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label={t("profit.model.first")}
                    value={firstTier}
                    onChange={setFirstTier}
                  />
                  <Field label={t("profit.model.next")} value={nextTier} onChange={setNextTier} />
                </div>
              ) : (
                <Field label={t("profit.model.kg")} value={perKg} onChange={setPerKg} />
              )}
            </>
          )}
        </Card>

        <Card className="space-y-2 p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("profit.fees.title")}</h2>
          <div className="flex items-center gap-2">
            <input
              className={inputCls}
              type="number"
              min="0"
              step="0.5"
              value={fixedFees}
              onChange={(e) => setFixedFees(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">€</span>
          </div>
          <p className="text-xs text-muted-foreground">{t("profit.fees.hint")}</p>
        </Card>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={Weight} label={t("profit.kpi.weight")} value={`${data.kg.toFixed(2)} kg`} />
        <Kpi
          icon={Truck}
          label={t("profit.kpi.shipping")}
          value={formatCurrency(data.shippingTotal, lang)}
        />
        <Kpi
          icon={Coins}
          label={t("profit.kpi.invest")}
          value={formatCurrency(data.investment, lang)}
        />
        <Kpi
          icon={TrendingUp}
          label={t("profit.kpi.profit")}
          value={formatCurrency(data.profit, lang)}
          accent={data.profit >= 0 ? "text-success" : "text-destructive"}
        />
        <Kpi
          icon={Percent}
          label={t("profit.kpi.margin")}
          value={`${data.avgMargin.toFixed(1)} %`}
          accent="text-primary"
        />
      </div>

      {/* Items */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary">
              <Calculator className="size-4" />
            </span>
            <p className="text-sm font-medium text-foreground">{t("profit.items")}</p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            <Plus className="size-3.5" />
            {t("profit.addItem")}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5">{t("profit.col.item")}</th>
                <th className="px-3 py-2.5">{t("profit.col.qty")}</th>
                <th className="px-3 py-2.5">{t("profit.col.priceYuan")}</th>
                <th className="px-3 py-2.5">{t("profit.col.weight")}</th>
                <th className="px-3 py-2.5">{t("profit.col.resale")}</th>
                <th className="px-3 py-2.5">{t("profit.col.shipUnit")}</th>
                <th className="px-3 py-2.5">{t("profit.col.cost")}</th>
                <th className="px-3 py-2.5">{t("profit.col.profit")}</th>
                <th className="px-3 py-2.5">{t("profit.col.margin")}</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {data.items.map((r, i) => (
                  <motion.tr
                    key={r.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-3 py-2">
                      <input
                        className={cellCls}
                        value={r.name}
                        placeholder={`${t("profit.col.item")} ${i + 1}`}
                        onChange={(e) => update(r.id, { name: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className={cellCls}
                        type="number"
                        min="1"
                        value={r.qty}
                        onChange={(e) => update(r.id, { qty: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className={cellCls}
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.priceYuan}
                        placeholder="99"
                        onChange={(e) => update(r.id, { priceYuan: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className={cellCls}
                        type="number"
                        min="0"
                        step="1"
                        value={r.weightG}
                        placeholder="250"
                        onChange={(e) => update(r.id, { weightG: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className={cellCls}
                        type="number"
                        min="0"
                        step="0.01"
                        value={r.resale}
                        placeholder="45"
                        onChange={(e) => update(r.id, { resale: e.target.value })}
                      />
                    </td>
                    <td className="nums px-3 py-2 text-muted-foreground">
                      {formatCurrency(r.shipUnit, lang)}
                    </td>
                    <td className="nums px-3 py-2 text-muted-foreground">
                      {formatCurrency(r.unitCost, lang)}
                    </td>
                    <td
                      className={cn(
                        "nums px-3 py-2 font-medium",
                        r.profitTotal >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {formatCurrency(r.profitTotal, lang)}
                    </td>
                    <td
                      className={cn(
                        "nums px-3 py-2 font-medium",
                        r.margin >= 0 ? "text-primary" : "text-destructive",
                      )}
                    >
                      {r.margin.toFixed(1)} %
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title={t("profit.sendToInventory")}
                          onClick={() =>
                            addItem({
                              name: r.name.trim() || `${t("profit.col.item")} ${i + 1}`,
                              buyPrice: Math.round(r.unitCost * 100) / 100,
                              sellPrice: r.resaleEur,
                              quantity: r.qty,
                              brand: "",
                              category: "",
                              condition: "",
                              size: "",
                              shippingFee: Math.round(r.shipUnit * 100) / 100,
                              parcel: "",
                              photoUrl: null,
                            })
                          }
                          className="grid size-7 place-items-center rounded text-muted-foreground transition hover:text-primary"
                        >
                          <Package className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          className="grid size-7 place-items-center rounded text-muted-foreground transition hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20";
const cellCls =
  "w-full min-w-[70px] rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground outline-none transition focus:border-primary/50";

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input
        className={inputCls}
        type="number"
        min="0"
        step="0.5"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  accent = "text-foreground",
}: {
  icon: typeof Weight;
  label: string;
  value: string;
  accent?: string;
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
