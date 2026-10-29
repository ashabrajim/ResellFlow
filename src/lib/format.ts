import type { Lang } from "./i18n";

export function formatCurrency(value: number, lang: Lang = "fr") {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, lang: Lang = "fr") {
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-US").format(value);
}
