import { useState } from "react";
import {
  Store,
  ShoppingCart,
  Tag,
  Gem,
  Volume2,
  RefreshCw,
  Bell,
  Languages,
  BadgeCheck,
  Gift,
} from "lucide-react";
import { useApp } from "../app-provider";
import { Card, SectionHeader, Toggle } from "../ui-kit";
import { AgentConfig } from "../china/agent-config";
import { cn } from "@/lib/utils";

const MARKETPLACES = [
  { key: "vinted", name: "Vinted", icon: Store, color: "text-primary", bg: "bg-primary/10" },
  { key: "ebay", name: "eBay", icon: ShoppingCart, color: "text-accent", bg: "bg-accent/10" },
  {
    key: "leboncoin",
    name: "Leboncoin",
    icon: Tag,
    color: "text-orange-600",
    bg: "bg-orange-500/10",
  },
  {
    key: "vestiaire",
    name: "Vestiaire Collective",
    icon: Gem,
    color: "text-rose-600",
    bg: "bg-rose-500/10",
  },
] as const;

export function SettingsSection() {
  const {
    t,
    lang,
    setLang,
    vintedConnected,
    connectVinted,
    disconnectVinted,
    settings,
    updateSetting,
  } = useApp();
  const [connections, setConnections] = useState<Record<string, boolean>>({
    ebay: false,
    leboncoin: false,
    vestiaire: false,
  });

  const isConnected = (key: string) => (key === "vinted" ? vintedConnected : connections[key]);

  const toggleConnection = (key: string) => {
    if (key === "vinted") {
      if (vintedConnected) disconnectVinted();
      else connectVinted("ma_boutique");
      return;
    }
    setConnections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-6">
      <SectionHeader title={t("set.title")} subtitle={t("set.subtitle")} />

      {/* Free banner */}
      <Card className="flex flex-col items-start gap-3 border-primary/25 bg-primary/5 p-5 sm:flex-row sm:items-center">
        <span className="grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
          <Gift className="size-5" />
        </span>
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
            {t("set.free.title")}
            <BadgeCheck className="size-4 text-primary" />
          </h2>
          <p className="text-sm text-muted-foreground">{t("set.free.desc")}</p>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Marketplaces */}
        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">{t("set.marketplaces")}</h2>
          <ul className="space-y-2">
            {MARKETPLACES.map((mp) => {
              const Icon = mp.icon;
              const connected = isConnected(mp.key);
              return (
                <li
                  key={mp.key}
                  className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn("grid size-9 place-items-center rounded-lg", mp.bg, mp.color)}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{mp.name}</p>
                      <p
                        className={cn(
                          "text-xs",
                          connected ? "text-primary" : "text-muted-foreground",
                        )}
                      >
                        {connected ? t("common.connected") : t("common.notConnected")}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleConnection(mp.key)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                      connected
                        ? "border border-border text-muted-foreground hover:text-destructive"
                        : "bg-primary text-primary-foreground hover:bg-primary/90",
                    )}
                  >
                    {connected ? t("vinted.connect.disconnect") : t("common.connect")}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Preferences */}
        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="mb-4 text-base font-semibold text-foreground">{t("set.preferences")}</h2>
            <ul className="space-y-2">
              <PrefRow
                icon={Volume2}
                label={t("set.pref.voice")}
                checked={settings.voiceReplies}
                onChange={(v) => updateSetting("voiceReplies", v)}
              />
              <PrefRow
                icon={RefreshCw}
                label={t("set.pref.sync")}
                checked={settings.autoSync}
                onChange={(v) => updateSetting("autoSync", v)}
              />
              <PrefRow
                icon={Bell}
                label={t("set.pref.notif")}
                checked={settings.saleNotifs}
                onChange={(v) => updateSetting("saleNotifs", v)}
              />
            </ul>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold text-foreground">{t("cn.settings.title")}</h2>
            <p className="mb-4 text-xs text-muted-foreground">{t("cn.settings.desc")}</p>
            <AgentConfig />
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Languages className="size-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">{t("set.lang")}</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["fr", "en"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-sm font-medium transition",
                    lang === l
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l === "fr" ? "Français" : "English"}
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PrefRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: typeof Volume2;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <li className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3">
      <span className="flex items-center gap-3 text-sm text-foreground">
        <span className="grid size-8 place-items-center rounded-lg bg-card text-primary">
          <Icon className="size-4" />
        </span>
        {label}
      </span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </li>
  );
}
