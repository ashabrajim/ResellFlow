// Calculs monétaires en CENTIMES entiers pour éviter les erreurs de flottants.
// Règle d'arrondi : le prix unitaire converti est arrondi au centime (demi supérieur),
// puis le sous-total = prix unitaire arrondi × quantité. Ainsi le sous-total affiché
// est toujours cohérent avec le prix unitaire affiché.

export function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100);
}

/** Convertit un montant (unités majeures) avec un taux ; renvoie des centimes. */
export function convertToCents(amount: number, rate: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(rate)) return 0;
  return Math.round((amount * rate + Number.EPSILON) * 100);
}

function group(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** « 1 234,56 € » — espaces normaux (pas d'espaces insécables, plus sûr dans WhatsApp). */
export function formatEurCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const int = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${neg ? "-" : ""}${group(String(int))},${frac} €`;
}

/** Montant dans la devise d'origine : « 90,00 CNY » ou « ¥ 90,00 ». */
export function formatOriginal(amount: number, currency: string): string {
  const cents = toCents(amount);
  const int = Math.floor(Math.abs(cents) / 100);
  const frac = String(Math.abs(cents) % 100).padStart(2, "0");
  const sign = cents < 0 ? "-" : "";
  return `${sign}${group(String(int))},${frac} ${currency}`;
}

/** Taux affiché lisiblement : 0,1234 (4 décimales significatives minimum). */
export function formatRate(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  const digits = rate < 0.01 ? 6 : 4;
  return rate.toFixed(digits).replace(".", ",");
}

/** « 2026-10-27 » -> « 27/10/2026 » (sans dépendre du fuseau horaire). */
export function formatIsoDateFr(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Parse un nombre saisi par l'utilisateur (« 12,5 », « 1 200.50 »). null si invalide. */
export function parseAmount(input: string): number | null {
  const s = input.trim().replace(/[\s\u00a0\u202f]/g, "");
  if (!s) return null;
  let norm = s;
  if (s.includes(",") && s.includes(".")) {
    // le dernier séparateur est le séparateur décimal
    norm =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replace(/\./g, "").replace(",", ".")
        : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    norm = s.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(norm)) return null;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}
