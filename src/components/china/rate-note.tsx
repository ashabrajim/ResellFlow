import { Loader2, RefreshCw } from "lucide-react";
import { formatIsoDateFr, formatRate } from "@/lib/china/money";
import { useApp } from "../app-provider";
import { useChina } from "../china-provider";
import { secondaryBtn } from "./styles";

/**
 * Taux de change réellement utilisé : taux, date de publication, source.
 * Rien n'est affiché en dur : si le taux n'est pas chargé, on le dit et on propose de réessayer.
 */
export function RateNote({ currency, className = "" }: { currency: string; className?: string }) {
  const { t } = useApp();
  const { rates, ratesStatus, refreshRates } = useChina();
  if (currency === "EUR") return null;
  const info = rates[currency];

  if (!info) {
    return (
      <p className={`flex flex-wrap items-center gap-2 text-xs text-muted-foreground ${className}`}>
        {ratesStatus === "loading" ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
        ) : null}
        <span>{t("cn.product.rate.none")}</span>
        {ratesStatus !== "loading" ? (
          <button
            type="button"
            className={`${secondaryBtn} !px-2 !py-1 text-xs`}
            onClick={() => void refreshRates()}
          >
            <RefreshCw className="size-3" /> {t("cn.product.rate.retry")}
          </button>
        ) : null}
      </p>
    );
  }
  return (
    <p className={`text-xs text-muted-foreground ${className}`}>
      <span className="nums">
        {t("cn.product.rate.line", {
          from: info.from,
          rate: formatRate(info.rate),
          date: formatIsoDateFr(info.date),
          source: info.source,
        })}
      </span>
      {info.stale ? (
        <span className="ml-1 font-medium text-destructive">{t("cn.product.rate.stale")}</span>
      ) : null}
    </p>
  );
}
