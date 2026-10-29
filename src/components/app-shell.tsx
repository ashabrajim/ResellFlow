import { createContext, useContext, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X, Languages, Sparkles, Zap, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "./app-provider";
import { useChina } from "./china-provider";
import { NAV_ITEMS, type SectionKey } from "./nav-config";
import { FreeBadge } from "./ui-kit";

import { DashboardSection } from "./sections/dashboard-section";
import { InventorySection } from "./sections/inventory-section";
import { VintedSection } from "./sections/vinted-section";
import { ProfitSection } from "./sections/profit-section";
import { VoiceSection } from "./sections/voice-section";
import { ShippingSection } from "./sections/shipping-section";
import { AccountingSection } from "./sections/accounting-section";
import { SettingsSection } from "./sections/settings-section";
import { ChinaSection } from "./sections/china-section";

type NavContextValue = {
  active: SectionKey;
  navigate: (s: SectionKey, action?: string) => void;
  pendingAction: string | null;
  consumeAction: () => void;
};

const NavContext = createContext<NavContextValue | null>(null);
export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within AppShell");
  return ctx;
}

export function AppShell() {
  const { t, lang, setLang } = useApp();
  const { units: cartUnits } = useChina();
  const [active, setActive] = useState<SectionKey>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const navigate = useCallback((s: SectionKey, action?: string) => {
    setActive(s);
    setPendingAction(action ?? null);
    setMobileOpen(false);
  }, []);

  const consumeAction = useCallback(() => setPendingAction(null), []);

  const navValue: NavContextValue = { active, navigate, pendingAction, consumeAction };

  return (
    <NavContext.Provider value={navValue}>
      <div className="grid-fade flex min-h-screen bg-background">
        {/* Sidebar - desktop */}
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
          <SidebarContent active={active} onNavigate={navigate} />
        </aside>

        {/* Sidebar - mobile drawer */}
        <AnimatePresence>
          {mobileOpen ? (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileOpen(false)}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              />
              <motion.aside
                initial={{ x: -320 }}
                animate={{ x: 0 }}
                exit={{ x: -320 }}
                transition={{ type: "spring", stiffness: 320, damping: 34 }}
                className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar lg:hidden"
              >
                <SidebarContent active={active} onNavigate={navigate} />
              </motion.aside>
            </>
          ) : null}
        </AnimatePresence>

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Menu"
                onClick={() => setMobileOpen(true)}
                className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground lg:hidden"
              >
                <Menu className="size-4" />
              </button>
              <FreeBadge className="hidden sm:inline-flex" />
            </div>

            <div className="flex items-center gap-2">
              {/* Panier Achat Chine */}
              <button
                type="button"
                aria-label={`${t("cn.tab.cart")} — ${t("cn.cart.count", { count: cartUnits })}`}
                onClick={() => navigate("china", "cart")}
                className="relative grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition hover:text-foreground"
              >
                <ShoppingCart className="size-4" />
                {cartUnits > 0 ? (
                  <span className="nums absolute -right-1.5 -top-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
                    {cartUnits > 99 ? "99+" : cartUnits}
                  </span>
                ) : null}
              </button>

              {/* Language switch */}
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
                <Languages className="ml-1 size-3.5 text-muted-foreground" />
                {(["fr", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-semibold uppercase transition",
                      lang === l
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>

              {/* Account */}
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card py-1 pl-1 pr-2.5">
                <span className="grid size-7 place-items-center rounded-md bg-gradient-to-br from-primary to-accent text-xs font-bold text-primary-foreground">
                  RF
                </span>
                <div className="hidden text-left leading-tight sm:block">
                  <p className="text-xs font-medium text-foreground">{t("app.account")}</p>
                  <p className="text-[10px] text-muted-foreground">{t("app.shop")}</p>
                </div>
              </div>
            </div>
          </header>

          {/* Content */}
          <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                >
                  {active === "dashboard" && <DashboardSection />}
                  {active === "china" && <ChinaSection />}
                  {active === "inventory" && <InventorySection />}
                  {active === "vinted" && <VintedSection />}
                  {active === "profit" && <ProfitSection />}
                  {active === "voice" && <VoiceSection />}
                  {active === "shipping" && <ShippingSection />}
                  {active === "accounting" && <AccountingSection />}
                  {active === "settings" && <SettingsSection />}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </NavContext.Provider>
  );
}

function SidebarContent({
  active,
  onNavigate,
}: {
  active: SectionKey;
  onNavigate: (s: SectionKey) => void;
}) {
  const { t } = useApp();
  return (
    <>
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="relative grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent">
          <Zap className="size-5 text-primary-foreground" fill="currentColor" />
        </span>
        <div className="leading-tight">
          <p className="text-base font-semibold tracking-tight text-foreground">ResellFlow</p>
          <p className="text-[11px] text-muted-foreground">{t("app.tagline")}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onNavigate(item.key)}
              className={cn(
                "group flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition",
                isActive
                  ? "border-primary/30 bg-primary/10"
                  : "border-transparent hover:border-border hover:bg-sidebar-accent",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg transition",
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "bg-sidebar-accent text-muted-foreground group-hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span
                  className={cn(
                    "block truncate text-sm font-medium",
                    isActive ? "text-foreground" : "text-sidebar-foreground",
                  )}
                >
                  {t(item.labelKey)}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {t(item.descKey)}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="mb-1 flex items-center gap-2 text-primary">
            <Sparkles className="size-4" />
            <span className="text-xs font-semibold">{t("set.free.title")}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">{t("set.free.desc")}</p>
        </div>
      </div>
    </>
  );
}
