import { useMemo, useState } from "react";
import { ChevronDown, Copy, MessageCircle } from "lucide-react";
import { formatEurCents } from "@/lib/china/money";
import { buildOrderMessage, normalizePhone, whatsappLink } from "@/lib/china/whatsapp";
import { useApp } from "../app-provider";
import { useChina } from "../china-provider";
import { Card, useToast } from "../ui-kit";
import { AgentConfig } from "./agent-config";
import { primaryBtn, secondaryBtn } from "./styles";

export function CheckoutPanel({ onBackToCart }: { onBackToCart: () => void }) {
  const { t } = useApp();
  const toast = useToast();
  const { totals, agentPhone } = useChina();
  const [openedCount, setOpenedCount] = useState(0);

  const message = useMemo(() => buildOrderMessage(totals), [totals]);
  const phone = normalizePhone(agentPhone);
  const empty = totals.lines.length === 0;
  const multi = message.parts.length > 1;

  const open = (part: string) => {
    if (!phone.ok) return;
    window.open(whatsappLink(phone.digits, part), "_blank", "noopener,noreferrer");
    setOpenedCount((n) => n + 1);
    toast.push("info", t("cn.checkout.opened"));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.full);
      toast.push("success", t("cn.checkout.copied"));
    } catch {
      toast.push("error", t("cn.checkout.copyFail"));
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
      <div className="space-y-4">
        <Card className="space-y-4 p-4">
          <h2 className="text-sm font-semibold text-foreground">{t("cn.checkout.agent")}</h2>
          <AgentConfig />
        </Card>
        <Card className="p-4">
          <details className="group text-xs text-muted-foreground">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-foreground">
              {t("cn.checkout.auto.title")}
              <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
            </summary>
            <p className="mt-2">{t("cn.checkout.auto.body")}</p>
          </details>
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        {empty ? (
          <Card className="space-y-3 p-6 text-center">
            <p className="text-sm text-muted-foreground">{t("cn.checkout.empty")}</p>
            <button type="button" className={secondaryBtn} onClick={onBackToCart}>
              {t("cn.tab.cart")}
            </button>
          </Card>
        ) : (
          <>
            <Card className="grid grid-cols-3 gap-3 p-4 text-center">
              <div>
                <p className="nums text-lg font-semibold text-foreground">{totals.references}</p>
                <p className="text-xs text-muted-foreground">{t("cn.cart.references")}</p>
              </div>
              <div>
                <p className="nums text-lg font-semibold text-foreground">{totals.units}</p>
                <p className="text-xs text-muted-foreground">{t("cn.cart.units")}</p>
              </div>
              <div>
                <p className="nums text-lg font-semibold text-primary">
                  {totals.complete ? formatEurCents(totals.productsCents) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">{t("cn.cart.products")}</p>
              </div>
            </Card>

            <Card className="space-y-3 p-4">
              <h2 className="text-sm font-semibold text-foreground">{t("cn.checkout.preview")}</h2>
              <pre
                tabIndex={0}
                className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-secondary/40 p-3 font-sans text-xs leading-relaxed text-foreground"
                lang="fr"
              >
                {message.full}
              </pre>

              {multi ? (
                <p className="text-xs text-muted-foreground">
                  {t("cn.checkout.multi", { n: message.parts.length })}
                </p>
              ) : null}
              {!phone.ok ? (
                <p className="text-xs text-muted-foreground">{t("cn.checkout.noPhone")}</p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {message.parts.map((part, i) => (
                  <button
                    key={i}
                    type="button"
                    className={primaryBtn}
                    disabled={!phone.ok}
                    onClick={() => open(part)}
                  >
                    <MessageCircle className="size-4" aria-hidden />
                    {multi
                      ? t("cn.checkout.sendPart", { i: i + 1, n: message.parts.length })
                      : t("cn.checkout.send")}
                  </button>
                ))}
                <button type="button" className={secondaryBtn} onClick={() => void copy()}>
                  <Copy className="size-4" aria-hidden /> {t("cn.checkout.copy")}
                </button>
              </div>

              <p className="text-xs text-muted-foreground" aria-live="polite">
                {openedCount > 0 ? t("cn.checkout.opened") : t("cn.checkout.notSent")}
              </p>
              <p className="text-xs text-muted-foreground">{t("cn.checkout.estimate")}</p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
