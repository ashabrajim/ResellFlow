import { useEffect, useState } from "react";
import { Download, Receipt, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ManualProductInput } from "@/lib/china/product";
import { useApp } from "../app-provider";
import { useChina } from "../china-provider";
import { useNav } from "../app-shell";
import { SectionHeader } from "../ui-kit";
import { CartPanel } from "../china/cart-panel";
import { CheckoutPanel } from "../china/checkout-panel";
import { ImportPanel } from "../china/import-panel";
import { ProductEditor } from "../china/product-editor";
import { ProductView } from "../china/product-view";

type Tab = "import" | "cart" | "checkout";
type Editing =
  { mode: "create"; url: string; prefill?: ManualProductInput } | { mode: "edit" } | null;

export function ChinaSection() {
  const { t } = useApp();
  const { current, setCurrent, rememberProduct, units } = useChina();
  const { pendingAction, consumeAction } = useNav();
  const [tab, setTab] = useState<Tab>("import");
  const [editing, setEditing] = useState<Editing>(null);

  // Ouverture directe sur le panier depuis la barre du haut.
  useEffect(() => {
    if (pendingAction === "cart") {
      setTab("cart");
      consumeAction();
    }
  }, [pendingAction, consumeAction]);

  const tabs: { key: Tab; label: string; icon: typeof Download; badge?: number }[] = [
    { key: "import", label: t("cn.tab.import"), icon: Download },
    { key: "cart", label: t("cn.tab.cart"), icon: ShoppingCart, badge: units },
    { key: "checkout", label: t("cn.tab.checkout"), icon: Receipt },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader title={t("cn.title")} subtitle={t("cn.subtitle")} />

      <div
        role="tablist"
        aria-label={t("cn.title")}
        className="flex gap-1 rounded-xl border border-border bg-card p-1"
      >
        {tabs.map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`cn-tab-${key}`}
            aria-selected={tab === key}
            aria-controls="cn-panel"
            onClick={() => setTab(key)}
            className={cn(
              "flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span>{label}</span>
            {badge ? (
              <span
                className={cn(
                  "nums rounded-full px-1.5 text-[11px] font-semibold",
                  tab === key ? "bg-primary-foreground/20" : "bg-primary/10 text-primary",
                )}
              >
                {badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div id="cn-panel" role="tabpanel" aria-labelledby={`cn-tab-${tab}`}>
        {tab === "import" ? (
          editing ? (
            <ProductEditor
              mode={editing.mode}
              {...(editing.mode === "create"
                ? { initialUrl: editing.url, prefill: editing.prefill ?? null }
                : { base: current })}
              onSubmit={(p) => {
                setCurrent(p);
                rememberProduct(p);
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : current ? (
            <ProductView
              product={current}
              onBack={() => setCurrent(null)}
              onEdit={() => setEditing({ mode: "edit" })}
              onGoCart={() => setTab("cart")}
            />
          ) : (
            <ImportPanel
              onImported={(p) => setCurrent(p)}
              onManual={(url) => setEditing({ mode: "create", url })}
              onPrefill={(prefill) =>
                setEditing({ mode: "create", url: prefill.sourceUrl, prefill })
              }
            />
          )
        ) : null}
        {tab === "cart" ? (
          <CartPanel onImport={() => setTab("import")} onCheckout={() => setTab("checkout")} />
        ) : null}
        {tab === "checkout" ? <CheckoutPanel onBackToCart={() => setTab("cart")} /> : null}
      </div>
    </div>
  );
}
