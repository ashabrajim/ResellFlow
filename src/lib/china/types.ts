// Types partagés (client + serveur) du module « Achat Chine ».
// Aucun import externe : ces fichiers sont testables avec `node --test`.

export type PlatformId = "taobao" | "tmall" | "weidian" | "1688" | "aliexpress";

/** `other` = lien fourni manuellement depuis une plateforme non prise en charge. */
export type ProductPlatform = PlatformId | "other";

export type Availability = "in_stock" | "out_of_stock" | "unknown";

export type ProductOptionValue = {
  /** Libellé affiché (traduit en français quand c'est possible). */
  label: string;
  /** Libellé d'origine, conservé pour la commande auprès de l'agent. */
  labelOriginal?: string;
  image?: string;
};

export type ProductOption = {
  name: string;
  values: ProductOptionValue[];
};

export type ProductVariant = {
  /** nom d'option -> libellé de valeur (libellés tels qu'affichés dans `options`). */
  options: Record<string, string>;
  /** Prix unitaire en unités majeures de `Product.currency`. */
  price?: number;
  available?: boolean;
  image?: string;
};

export type Review = {
  author?: string;
  rating?: number;
  text: string;
  textOriginal?: string;
  date?: string;
};

export type ProductRating = { average: number; count: number | null };

export type ProductWarning =
  "translation_unavailable" | "partial_data" | "no_price" | "no_images" | "no_options";

export type Product = {
  /** `${platform}:${itemId}` pour un import automatique, `manual:<uid>` sinon. */
  id: string;
  platform: ProductPlatform;
  platformLabel: string;
  sourceUrl: string;
  itemId: string | null;
  title: string;
  titleOriginal: string | null;
  description: string | null;
  descriptionOriginal: string | null;
  images: string[];
  /** Code ISO 4217 de la devise d'origine (CNY, USD, EUR…). */
  currency: string;
  price: { min: number; max: number } | null;
  options: ProductOption[];
  variants: ProductVariant[];
  rating: ProductRating | null;
  reviews: Review[];
  availability: Availability;
  seller: string | null;
  origin: "auto" | "manual";
  fetchedAt: string;
  warnings: ProductWarning[];
};

export type ImportErrorCode =
  | "EMPTY_INPUT"
  | "INVALID_URL"
  | "UNSUPPORTED_PLATFORM"
  | "BLOCKED"
  | "NO_DATA"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "NETWORK"
  | "TOO_LARGE"
  | "BAD_CONTENT"
  | "TOO_MANY_REDIRECTS"
  | "RATE_LIMITED"
  | "INTERNAL";

export type ImportResult =
  | { ok: true; product: Product; cached: boolean }
  | {
      ok: false;
      code: ImportErrorCode;
      message: string;
      sourceUrl?: string;
      platform?: ProductPlatform;
    };

export type RateInfo = {
  from: string;
  to: string;
  rate: number;
  /** Date de publication du taux par la source (YYYY-MM-DD). */
  date: string;
  /** Moment où le serveur a récupéré le taux (ISO). */
  fetchedAt: string;
  source: string;
  stale: boolean;
};

export type RatesResult =
  | { ok: true; rates: Record<string, RateInfo> }
  | { ok: false; code: "RATES_UNAVAILABLE" | "INVALID_INPUT" | "RATE_LIMITED"; message: string };

export type CartLine = {
  lineId: string;
  productId: string;
  platform: ProductPlatform;
  platformLabel: string;
  sourceUrl: string;
  title: string;
  titleOriginal: string | null;
  image: string | null;
  /** nom d'option -> valeur choisie */
  selection: Record<string, string>;
  /** Valeurs d'origine (chinois) des choix, si connues, pour l'agent. */
  selectionOriginal: Record<string, string>;
  size: string | null;
  color: string | null;
  quantity: number;
  /** Prix unitaire en unités majeures de `currency`. */
  unitPrice: number;
  currency: string;
  addedAt: number;
};
