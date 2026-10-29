import { useState } from "react";
import {
  Store,
  Link2,
  Users,
  Eye,
  Star,
  TrendingUp,
  Clock,
  EyeOff,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useApp } from "../app-provider";
import { Card, SectionHeader, Toggle } from "../ui-kit";
import { cn } from "@/lib/utils";

export function VintedSection() {
  const { t, vintedConnected, shopHandle, connectVinted, disconnectVinted } = useApp();
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [liveSync, setLiveSync] = useState(true);

  const recos = [
    {
      icon: TrendingUp,
      title: t("vinted.reco.pricing"),
      desc: t("vinted.reco.pricing.desc"),
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: Clock,
      title: t("vinted.reco.time"),
      desc: t("vinted.reco.time.desc"),
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      icon: EyeOff,
      title: t("vinted.reco.visibility"),
      desc: t("vinted.reco.visibility.desc"),
      color: "text-amber-600",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader title={t("vinted.title")} subtitle={t("vinted.subtitle")} />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Connect card */}
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/15 text-primary">
              <Store className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {t("vinted.connect.title")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {vintedConnected ? `@${shopHandle}` : t("common.notConnected")}
              </p>
            </div>
          </div>

          {vintedConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-primary">
                <CheckCircle2 className="size-4" />
                {t("common.connected")} — @{shopHandle}
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 px-4 py-3">
                <span className="text-sm text-foreground">{t("vinted.connect.sync")}</span>
                <Toggle
                  checked={liveSync}
                  onChange={setLiveSync}
                  label={t("vinted.connect.sync")}
                />
              </div>
              <button
                type="button"
                onClick={disconnectVinted}
                className="w-full rounded-lg border border-border px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-destructive/40 hover:text-destructive"
              >
                {t("vinted.connect.disconnect")}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("vinted.connect.handle")}
                </span>
                <div className="flex items-center rounded-lg border border-border bg-secondary/40 px-3 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="text-sm text-muted-foreground">@</span>
                  <input
                    className="w-full bg-transparent px-1 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="ma_boutique"
                  />
                </div>
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("vinted.connect.password")}
                </span>
                <input
                  type="password"
                  className="w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </label>
              <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/40 px-4 py-3">
                <span className="text-sm text-foreground">{t("vinted.connect.sync")}</span>
                <Toggle
                  checked={liveSync}
                  onChange={setLiveSync}
                  label={t("vinted.connect.sync")}
                />
              </div>
              <button
                type="button"
                onClick={() => handle.trim() && connectVinted(handle.trim())}
                disabled={!handle.trim()}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
              >
                <Link2 className="size-4" />
                {t("vinted.connect.cta")}
              </button>
            </div>
          )}
        </Card>

        {/* Shop stats */}
        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">Stats</h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat icon={Users} label={t("vinted.stats.followers")} value="0" />
            <Stat icon={Eye} label={t("vinted.stats.views")} value="0" />
            <Stat icon={Star} label={t("vinted.stats.rating")} value="—" />
          </div>
          {!vintedConnected ? (
            <p className="mt-4 rounded-lg border border-dashed border-border bg-secondary/30 px-4 py-3 text-xs text-muted-foreground">
              {t("common.notConnected")} — {t("dash.banner")}
            </p>
          ) : null}
        </Card>
      </div>

      {/* Recommendations */}
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">{t("vinted.reco.title")}</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {recos.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.title} className="rounded-xl border border-border bg-secondary/30 p-4">
                <span
                  className={cn("mb-3 grid size-9 place-items-center rounded-lg", r.bg, r.color)}
                >
                  <Icon className="size-4" />
                </span>
                <h3 className="text-sm font-medium text-foreground">{r.title}</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{r.desc}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-3 text-center">
      <span className="mx-auto mb-2 grid size-8 place-items-center rounded-lg bg-card text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <p className="nums text-lg font-semibold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
