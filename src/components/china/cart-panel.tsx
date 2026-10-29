import { useState } from "react";
import {
  AlertTriangle,
  ExternalLink,
  ImageOff,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { MAX_QTY } from "@/lib/china/cart";
import { formatEurCents, formatOriginal } from "@/lib/china/money";
import { useApp } from "../app-provider";
import { useChina } from "../china-provider";
import { Card } from "../ui-kit";
import { RateNote } from "./rate-note";
import { primaryBtn, secondaryBtn } from "./styles";

export function CartPanel({
  onImport,
  onCheckout,
}: {
  onImport: () => void;
  onCheckout: () => void;
}) {
  const { t } = useApp();
  const { totals, setQuantity, removeFromCart, clearCart } = useChina();
  const [confirmClear, setConfirmClear] = useState(false);

  if (totals.lines.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 p-10 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground">
          <ShoppingCart className="size-5" aria-hidden />
        </span>
        <p className="text-sm text-muted-foreground">{t("cn.cart.empty")}</p>
        <button type="button" className={primaryBtn} onClick={onImport}>
          {t("cn.cart.empty.cta")}
        </button>
      </Card>
    );
  }

  const currencies = [...new Set(totals.lines.map((l) => l.line.currency))].filter(
    (c) => c !== "EUR",
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">{t("cn.cart.title")}</h2>
          {confirmClear ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{t("cn.cart.clear.confirm")}</span>
              <button
                type="button"
                className="rounded-md bg-destructive px-2.5 py-1 font-medium text-destructive-foreground"
                onClick={() => {
                  clearCart();
                  setConfirmClear(false);
                }}
              >
                {t("cn.cart.clear.yes")}
              </button>
              <button
                type="button"
                className={`${secondaryBtn} !px-2.5 !py-1 text-xs`}
                onClick={() => setConfirmClear(false)}
              >
                {t("common.cancel")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 className="size-3.5" aria-hidden /> {t("cn.cart.clear")}
            </button>
          )}
        </div>

        <ul className="space-y-3">
          {totals.lines.map((lt) => {
            const { line } = lt;
            return (
              <li key={line.lineId}>
                <Card className="flex gap-3 p-3 sm:gap-4 sm:p-4">
                  <span className="size-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted sm:size-24">
                    {line.image ? (
                      <img
                        src={line.image}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="grid size-full place-items-center text-muted-foreground">
                        <ImageOff className="size-5" aria-hidden />
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-medium text-foreground">
                          {line.title}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span className="font-semibold text-primary">{line.platformLabel}</span>
                          <a
                            href={line.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                          >
                            <ExternalLink className="size-3" aria-hidden /> {t("cn.cart.source")}
                          </a>
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`${t("cn.cart.remove")} : ${line.title}`}
                        onClick={() => removeFromCart(line.lineId)}
                        className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    {Object.keys(line.selection).length > 0 ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {Object.entries(line.selection).map(([k, v]) => (
                          <li
                            key={k}
                            className="rounded-md bg-secondary px-2 py-0.5 text-xs text-foreground"
                          >
                            <span className="text-muted-foreground">{k} :</span> {v}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div
                        className="flex items-center rounded-lg border border-border bg-card"
                        role="group"
                        aria-label={t("cn.cart.qty")}
                      >
                        <button
                          type="button"
                          aria-label={t("cn.cart.qty.dec")}
                          className="grid size-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                          disabled={line.quantity <= 1}
                          onClick={() => setQuantity(line.lineId, line.quantity - 1)}
                        >
                          <Minus className="size-4" />
                        </button>
                        <input
                          aria-label={t("cn.cart.qty")}
                          inputMode="numeric"
                          className="nums h-9 w-12 bg-transparent text-center text-sm outline-none"
                          value={line.quantity}
                          onChange={(e) => {
                            const n = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                            if (Number.isFinite(n)) setQuantity(line.lineId, n);
                          }}
                        />
                        <button
                          type="button"
                          aria-label={t("cn.cart.qty.inc")}
                          className="grid size-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                          disabled={line.quantity >= MAX_QTY}
                          onClick={() => setQuantity(line.lineId, line.quantity + 1)}
                        >
                          <Plus className="size-4" />
                        </button>
                      </div>
                      <div className="nums text-right text-xs text-muted-foreground">
                        <p>
                          {t("cn.cart.unit")} : {formatOriginal(line.unitPrice, line.currency)}
                          {lt.unitCents !== null && line.currency !== "EUR"
                            ? ` ≈ ${formatEurCents(lt.unitCents)}`
                            : ""}
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {t("cn.cart.subtotal")} :{" "}
                          {lt.subtotalCents !== null ? (
                            formatEurCents(lt.subtotalCents)
                          ) : (
                            <span className="text-destructive">{t("cn.cart.convUnavailable")}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted-foreground">{t("cn.cart.persist")}</p>
      </div>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card className="space-y-3 p-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("cn.cart.references")}</dt>
              <dd className="nums font-medium">{totals.references}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("cn.cart.units")}</dt>
              <dd className="nums font-medium">{totals.units}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base">
              <dt className="font-semibold text-foreground">{t("cn.cart.products")}</dt>
              <dd className="nums font-semibold text-primary">
                {totals.complete ? formatEurCents(totals.productsCents) : "—"}
              </dd>
            </div>
            {totals.agentFeePercent > 0 && totals.complete ? (
              <div className="flex justify-between text-xs text-muted-foreground">
                <dt>
                  {t("cn.cart.agentFee", {
                    percent: String(totals.agentFeePercent).replace(".", ","),
                  })}
                </dt>
                <dd className="nums">{formatEurCents(totals.agentFeeCents)}</dd>
              </div>
            ) : null}
          </dl>
          {!totals.complete ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-foreground"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
              {t("cn.cart.incomplete", { currencies: totals.missingCurrencies.join(", ") })}
            </p>
          ) : null}
          {currencies.map((c) => (
            <RateNote key={c} currency={c} />
          ))}
          <p className="text-xs text-muted-foreground">{t("cn.product.fees.body")}</p>
          <button type="button" className={`${primaryBtn} w-full`} onClick={onCheckout}>
            {t("cn.cart.checkout")}
          </button>
        </Card>
      </aside>
    </div>
  );
}
