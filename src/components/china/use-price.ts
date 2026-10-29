import { useCallback } from "react";
import { convertToCents, formatEurCents, formatOriginal } from "@/lib/china/money";
import { useChina } from "../china-provider";

/** Conversion d'un montant d'origine vers l'euro avec le taux actuellement connu. */
export function usePrice() {
  const { rates } = useChina();

  /** Taux utilisé pour `currency` (1 pour EUR), ou null s'il est inconnu. */
  const rateFor = useCallback(
    (currency: string): number | null => (currency === "EUR" ? 1 : (rates[currency]?.rate ?? null)),
    [rates],
  );

  /** « 11,11 € » ou null si le taux est inconnu (on n'invente jamais une conversion). */
  const toEur = useCallback(
    (amount: number, currency: string): string | null => {
      const r = rateFor(currency);
      return r === null ? null : formatEurCents(convertToCents(amount, r));
    },
    [rateFor],
  );

  return { rateFor, toEur, original: formatOriginal, rates };
}
