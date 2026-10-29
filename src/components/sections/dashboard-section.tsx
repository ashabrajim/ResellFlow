import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Euro,
  TrendingUp,
  Package,
  ShoppingBag,
  Percent,
  Mic,
  Calculator,
  Plus,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import { useApp, useMetrics } from "../app-provider";
import { useNav } from "../app-shell";
import { Card, SectionHeader } from "../ui-kit";
import { formatCurrency, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type Range = "7d" | "1m" | "1y";

export function DashboardSection() {
  const { t, lang, vintedConnected, items, activities } = useApp();
  const m = useMetrics();
  const { navigate } = useNav();
  const [range, setRange] = useState<Range>("7d");

  const kpis = [
    {
      icon: Euro,
      label: t("kpi.revenue"),
      value: formatCurrency(m.revenue, lang),
      accent: "text-primary",
    },
    {
      icon: TrendingUp,
      label: t("kpi.profit"),
      value: formatCurrency(m.netProfit, lang),
      accent: "text-accent",
    },
    {
      icon: Package,
      label: t("kpi.stock"),
      value: formatNumber(m.inStock, lang),
      accent: "text-foreground",
    },
    {
      icon: ShoppingBag,
      label: t("kpi.sold"),
      value: formatNumber(m.soldCount, lang),
      accent: "text-foreground",
    },
    {
      icon: Percent,
      label: t("kpi.margin"),
      value: `${m.avgMargin.toFixed(0)} %`,
      accent: "text-primary",
    },
  ];

  const chartData = useMemo(() => buildSeries(range, items, lang), [range, items, lang]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeader title={t("dash.title")} subtitle={t("dash.subtitle")} />
      </div>

      {/* Not-connected banner */}
      {!vintedConnected ? (
        <Card className="flex flex-col items-start justify-between gap-3 border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <AlertTriangle className="size-4" />
            </span>
            <p className="text-sm text-amber-900">{t("dash.banner")}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate("vinted")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-600"
          >
            {t("dash.banner.cta")}
            <ArrowUpRight className="size-4" />
          </button>
        </Card>
      ) : null}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="grid size-9 place-items-center rounded-lg bg-secondary text-muted-foreground">
                  <Icon className="size-4" />
                </span>
              </div>
              <p className={cn("nums text-xl font-semibold tracking-tight", k.accent)}>{k.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{k.label}</p>
            </Card>
          );
        })}
      </div>

      {/* Chart */}
      <Card className="p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-foreground">{t("dash.chart.title")}</h2>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-secondary/50 p-1">
            {(["7d", "1m", "1y"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition",
                  range === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`dash.chart.${r}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="h-64 w-full">
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1f5d46" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#1f5d46" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="prof" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c98a1d" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#c98a1d" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip
                  contentStyle={{
                    background: "#111725",
                    border: "1px solid #1e293b",
                    borderRadius: 12,
                    color: "#e6edf5",
                    fontSize: 12,
                  }}
                  formatter={(value) => formatCurrency(Number(value), lang)}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name={t("kpi.revenue")}
                  stroke="#1f5d46"
                  strokeWidth={2}
                  fill="url(#rev)"
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  name={t("kpi.profit")}
                  stroke="#c98a1d"
                  strokeWidth={2}
                  fill="url(#prof)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Quick actions */}
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold text-foreground">{t("dash.quick")}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <QuickAction
              icon={Mic}
              label={t("dash.quick.voice")}
              onClick={() => navigate("voice")}
            />
            <QuickAction
              icon={Calculator}
              label={t("dash.quick.profit")}
              onClick={() => navigate("profit")}
            />
            <QuickAction
              icon={Plus}
              label={t("dash.quick.item")}
              onClick={() => navigate("inventory", "add")}
              highlight
            />
          </div>
        </Card>

        {/* Recent activity */}
        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">{t("dash.recent")}</h2>
          {activities.length === 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t("dash.recent.empty")}
            </p>
          ) : (
            <ul className="space-y-3">
              {activities.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-sm text-foreground/90">{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  highlight,
}: {
  icon: typeof Mic;
  label: string;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition",
        highlight
          ? "border-primary/30 bg-primary/10 hover:bg-primary/15"
          : "border-border bg-secondary/40 hover:border-primary/30 hover:bg-secondary/70",
      )}
    >
      <span
        className={cn(
          "grid size-10 place-items-center rounded-lg transition",
          highlight ? "bg-primary text-primary-foreground" : "bg-card text-primary",
        )}
      >
        <Icon className="size-5" />
      </span>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </button>
  );
}

function buildSeries(
  range: Range,
  items: {
    sellPrice: number;
    buyPrice: number;
    shippingFee: number;
    actualPrice: number | null;
    quantity: number;
    status: string;
    soldAt: number | null;
    createdAt: number;
  }[],
  lang: string,
) {
  const buckets = range === "7d" ? 7 : range === "1m" ? 30 : 12;
  const now = Date.now();
  const unit = range === "1y" ? 30 * 24 * 3600 * 1000 : 24 * 3600 * 1000;
  const sold = items.filter((i) => i.status === "sold");

  const data: { label: string; revenue: number; profit: number }[] = [];
  let cumRev = 0;
  let cumProfit = 0;
  // Bucket boundaries walk backwards from "now" in non-overlapping windows of width `unit`,
  // so each sale is counted in exactly one bucket before being accumulated cumulatively.
  for (let i = buckets - 1; i >= 0; i--) {
    const bucketEnd = now - i * unit;
    const bucketStart = bucketEnd - unit;
    const inBucket = sold.filter((s) => {
      const t = s.soldAt ?? s.createdAt;
      return t > bucketStart && t <= bucketEnd;
    });
    for (const s of inBucket) {
      const unitRevenue = s.actualPrice ?? s.sellPrice;
      const revenue = unitRevenue * s.quantity;
      cumRev += revenue;
      cumProfit += revenue - s.buyPrice * s.quantity - s.shippingFee - revenue * 0.05;
    }
    const d = new Date(bucketEnd);
    let label = "";
    if (range === "7d")
      label = d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { weekday: "short" });
    else if (range === "1m") label = String(d.getDate());
    else label = d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-US", { month: "short" });
    data.push({
      label,
      revenue: Math.round(cumRev * 100) / 100,
      profit: Math.round(cumProfit * 100) / 100,
    });
  }
  return data;
}
