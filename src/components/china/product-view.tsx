import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Minus,
  PackageCheck,
  Pencil,
  Plus,
  ShoppingCart,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatOriginal, parseAmount } from "@/lib/china/money";
import {
  findVariant,
  isSelectionComplete,
  resolveUnitPrice,
  type Selection,
} from "@/lib/china/product";
import { MAX_QTY } from "@/lib/china/cart";
import type { Product } from "@/lib/china/types";
import { useApp } from "../app-provider";
import { useChina } from "../china-provider";
import { Card, useToast } from "../ui-kit";
import { Gallery } from "./gallery";
import { RateNote } from "./rate-note";
import { usePrice } from "./use-price";
import { inputCls, labelCls, primaryBtn, secondaryBtn } from "./styles";

type Props = {
  product: Product;
  onBack: () => void;
  onEdit: () => void;
  onGoCart: () => void;
};

function initialSelection(product: Product): Selection {
  const sel: Selection = {};
  for (const o of product.options)
    if (o.values.length === 1) sel[o.name] = (o.values[0] as { label: string }).label;
  return sel;
}

/** Fiche produit intégrée : galerie, prix d'origine / converti, variantes, avis réels, ajout au panier. */
export function ProductView({ product, onBack, onEdit, onGoCart }: Props) {
  const { t, lang } = useApp();
  const toast = useToast();
  const { addProduct } = useChina();
  const { toEur } = usePrice();

  const [selection, setSelection] = useState<Selection>(() => initialSelection(product));
  const [quantity, setQuantity] = useState(1);
  const [priceText, setPriceText] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  // Nouveau produit (ou produit modifié) : on repart de zéro.
  useEffect(() => {
    setSelection(initialSelection(product));
    setQuantity(1);
    setPriceText(null);
    setJustAdded(false);
  }, [product]);

  const complete = isSelectionComplete(product, selection);
  const variant = useMemo(() => findVariant(product, selection), [product, selection]);
  const resolved = useMemo(() => resolveUnitPrice(product, selection), [product, selection]);
  const editablePrice = resolved.source === "none" || resolved.source === "range_min";
  const unitPrice = editablePrice && priceText !== null ? parseAmount(priceText) : resolved.price;
  const soldOut =
    variant?.available === false || (product.availability === "out_of_stock" && !variant);
  const unitEur = unitPrice !== null ? toEur(unitPrice, product.currency) : null;

  const dateFmt = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

  const add = () => {
    if (!complete) {
      toast.push("error", t("cn.product.options.incomplete"));
      return;
    }
    if (unitPrice === null || !(unitPrice > 0)) {
      toast.push("error", t("cn.product.invalidPrice"));
      return;
    }
    const res = addProduct({ product, selection, quantity, unitPrice });
    if (!res.ok) {
      toast.push(
        "error",
        res.code === "CART_FULL"
          ? t("cn.product.cartFull")
          : res.code === "INCOMPLETE_SELECTION"
            ? t("cn.product.options.incomplete")
            : t("cn.product.invalidPrice"),
      );
      return;
    }
    setJustAdded(true);
    toast.push("success", res.merged ? t("cn.product.merged") : t("cn.product.added"));
  };

  const range = product.price && product.price.min !== product.price.max ? product.price : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" className={secondaryBtn} onClick={onBack}>
          <ArrowLeft className="size-4" /> {t("cn.product.back")}
        </button>
        <button type="button" className={secondaryBtn} onClick={onEdit}>
          <Pencil className="size-4" /> {t("cn.product.edit")}
        </button>
      </div>

      {product.warnings.length > 0 ? (
        <ul className="space-y-1.5" aria-label="warnings">
          {product.warnings.map((w) => (
            <li
              key={w}
              className="flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-foreground"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
              {t(`cn.product.warn.${w}` as Parameters<typeof t>[0])}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <Gallery images={product.images} alt={product.title} />

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                {product.platformLabel}
              </span>
              <span className="text-muted-foreground">
                {product.origin === "manual"
                  ? t("cn.product.origin.manual")
                  : t("cn.product.origin.auto")}
              </span>
            </div>
            <h2 className="text-pretty text-xl font-semibold leading-snug text-foreground md:text-2xl">
              {product.title}
            </h2>
            {product.titleOriginal ? (
              <p className="text-sm text-muted-foreground" lang="zh">
                <span className="mr-1 font-medium">{t("cn.product.originalTitle")} :</span>
                {product.titleOriginal}
              </p>
            ) : null}
            <a
              href={product.sourceUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1.5 break-all text-sm font-medium text-primary underline-offset-2 hover:underline"
            >
              <ExternalLink className="size-3.5 shrink-0" aria-hidden /> {t("cn.product.source")}
            </a>
          </div>

          {/* Prix */}
          <Card className="space-y-3 p-4">
            {product.price ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className={labelCls}>{t("cn.product.price.original")}</p>
                  <p className="nums text-lg font-semibold text-foreground">
                    {range
                      ? `${formatOriginal(range.min, product.currency)} – ${formatOriginal(range.max, product.currency)}`
                      : formatOriginal(product.price.min, product.currency)}
                  </p>
                </div>
                <div>
                  <p className={labelCls}>{t("cn.product.price.converted")}</p>
                  <p className="nums text-lg font-semibold text-primary">
                    {range
                      ? `${toEur(range.min, product.currency) ?? "—"} – ${toEur(range.max, product.currency) ?? "—"}`
                      : (toEur(product.price.min, product.currency) ?? "—")}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t("cn.product.price.none")}</p>
            )}
            {range ? (
              <p className="text-xs text-muted-foreground">
                {t("cn.product.price.range", {
                  min: formatOriginal(range.min, product.currency),
                  max: formatOriginal(range.max, product.currency),
                })}
              </p>
            ) : null}
            <RateNote currency={product.currency} />
            <div className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              <p className="mb-0.5 font-semibold text-foreground">{t("cn.product.fees.title")}</p>
              {t("cn.product.fees.body")}
            </div>
          </Card>

          {/* Variantes */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">{t("cn.product.options")}</h3>
            {product.options.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("cn.product.options.none")}</p>
            ) : (
              product.options.map((o) => (
                <fieldset key={o.name} className="space-y-1.5">
                  <legend className={labelCls}>
                    {o.name}
                    {selection[o.name] ? (
                      <span className="ml-1 font-semibold text-foreground">
                        : {selection[o.name]}
                      </span>
                    ) : null}
                  </legend>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={o.name}>
                    {o.values.map((v) => {
                      const on = selection[o.name] === v.label;
                      return (
                        <button
                          key={v.label}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => {
                            setSelection((s) => ({ ...s, [o.name]: v.label }));
                            setJustAdded(false);
                          }}
                          className={cn(
                            "min-h-10 rounded-lg border px-3 py-1.5 text-sm transition outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            on
                              ? "border-primary bg-primary/10 font-semibold text-primary"
                              : "border-border bg-card text-foreground hover:bg-secondary/60",
                          )}
                        >
                          {v.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))
            )}
          </div>

          {/* Prix unitaire + quantité + ajout */}
          <Card className="space-y-3 p-4">
            {editablePrice ? (
              <label className="block space-y-1.5">
                <span className={labelCls}>
                  {t("cn.product.price.unit", { currency: product.currency })}
                  {resolved.source === "range_min" ? ` — ${t("cn.product.price.confirm")}` : ""}
                </span>
                <input
                  className={`${inputCls} nums`}
                  inputMode="decimal"
                  value={
                    priceText ??
                    (resolved.price !== null ? String(resolved.price).replace(".", ",") : "")
                  }
                  onChange={(e) => setPriceText(e.target.value)}
                  placeholder="90"
                />
              </label>
            ) : unitPrice !== null ? (
              <p className="text-sm text-foreground">
                {resolved.source === "variant" ? t("cn.product.price.variant") : t("cn.cart.unit")}{" "}
                :{" "}
                <span className="nums font-semibold">
                  {formatOriginal(unitPrice, product.currency)}
                </span>
                {unitEur ? <span className="nums text-muted-foreground"> ≈ {unitEur}</span> : null}
              </p>
            ) : null}
            {editablePrice && unitPrice !== null && unitPrice > 0 && unitEur ? (
              <p className="nums text-xs text-muted-foreground">≈ {unitEur}</p>
            ) : null}

            {soldOut ? (
              <p className="text-xs font-medium text-destructive">
                {t("cn.product.availability.out_of_stock")}
              </p>
            ) : null}
            {!complete && product.options.length > 0 ? (
              <p className="text-xs text-muted-foreground">{t("cn.product.options.incomplete")}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <div
                className="flex items-center rounded-lg border border-border bg-card"
                role="group"
                aria-label={t("cn.product.qty")}
              >
                <button
                  type="button"
                  aria-label={t("cn.cart.qty.dec")}
                  className="grid size-10 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                >
                  <Minus className="size-4" />
                </button>
                <input
                  aria-label={t("cn.product.qty")}
                  className="nums h-10 w-14 bg-transparent text-center text-sm outline-none"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value.replace(/\D/g, ""), 10);
                    setQuantity(Number.isFinite(n) ? Math.min(MAX_QTY, Math.max(1, n)) : 1);
                  }}
                />
                <button
                  type="button"
                  aria-label={t("cn.cart.qty.inc")}
                  className="grid size-10 place-items-center text-muted-foreground hover:text-foreground"
                  onClick={() => setQuantity((q) => Math.min(MAX_QTY, q + 1))}
                >
                  <Plus className="size-4" />
                </button>
              </div>
              <button type="button" className={`${primaryBtn} flex-1 sm:flex-none`} onClick={add}>
                <ShoppingCart className="size-4" /> {t("cn.product.add")}
              </button>
              {justAdded ? (
                <button type="button" className={secondaryBtn} onClick={onGoCart}>
                  {t("cn.product.goCart")}
                </button>
              ) : null}
            </div>
          </Card>

          {/* Infos de la source */}
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <div>
              <dt className={labelCls}>{t("cn.product.availability")}</dt>
              <dd className="flex items-center gap-1.5 text-foreground">
                <PackageCheck className="size-4 text-muted-foreground" aria-hidden />
                {t(`cn.product.availability.${product.availability}` as Parameters<typeof t>[0])}
              </dd>
            </div>
            {product.seller ? (
              <div>
                <dt className={labelCls}>{t("cn.product.seller")}</dt>
                <dd className="text-foreground">{product.seller}</dd>
              </div>
            ) : null}
            <div>
              <dt className={labelCls}>{t("cn.product.rating")}</dt>
              <dd className="text-foreground">
                {product.rating ? (
                  <span className="inline-flex items-center gap-1">
                    <Star className="size-4 fill-accent text-accent" aria-hidden />
                    <span className="nums font-semibold">
                      {product.rating.average.toFixed(1).replace(".", ",")}
                    </span>
                    {product.rating.count !== null ? (
                      <span className="text-muted-foreground">
                        ({t("cn.product.rating.count", { count: product.rating.count })})
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t("cn.product.rating.none")}</span>
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {product.description ? (
        <Card className="space-y-2 p-4">
          <h3 className="text-sm font-semibold text-foreground">{t("cn.product.description")}</h3>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{product.description}</p>
          {product.descriptionOriginal ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium text-foreground">
                {t("cn.product.descriptionOriginal")}
              </summary>
              <p className="mt-1 whitespace-pre-line" lang="zh">
                {product.descriptionOriginal}
              </p>
            </details>
          ) : null}
        </Card>
      ) : null}

      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-semibold text-foreground">{t("cn.product.reviews")}</h3>
        {product.reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("cn.product.reviews.none")}</p>
        ) : (
          <ul className="space-y-3">
            {product.reviews.map((r, i) => (
              <li key={i} className="space-y-1 border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {r.author ? (
                    <span className="font-medium text-foreground">{r.author}</span>
                  ) : null}
                  {r.rating !== undefined ? (
                    <span className="nums inline-flex items-center gap-0.5">
                      <Star className="size-3 fill-accent text-accent" aria-hidden /> {r.rating}
                    </span>
                  ) : null}
                  {r.date ? <span>{r.date}</span> : null}
                </div>
                <p className="text-sm text-foreground">{r.text}</p>
                {r.textOriginal ? (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">{t("cn.product.reviews.original")}</summary>
                    <p lang="zh">{r.textOriginal}</p>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        {t("cn.product.fetchedAt", { date: dateFmt(product.fetchedAt) })}
      </p>
    </div>
  );
}
