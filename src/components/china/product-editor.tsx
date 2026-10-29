import { useMemo, useState } from "react";
import { Languages, Loader2, Plus, Trash2 } from "lucide-react";
import {
  buildManualProduct,
  SUPPORTED_CURRENCIES,
  type ManualFieldError,
  type ManualProductInput,
} from "@/lib/china/product";
import { parseAmount } from "@/lib/china/money";
import type { Product } from "@/lib/china/types";
import { translateTextsFn } from "@/backend/china/functions";
import { useApp } from "../app-provider";
import { Card } from "../ui-kit";
import { useToast } from "../ui-kit";
import { inputCls, labelCls, primaryBtn, secondaryBtn } from "./styles";

type OptionRow = { key: string; name: string; valuesText: string; originals: string[] | null };

let rowSeq = 0;
const newRow = (name = "", valuesText = ""): OptionRow => ({
  key: `o${++rowSeq}`,
  name,
  valuesText,
  originals: null,
});
const splitValues = (s: string) => s.split(/[,\n;，、]/).map((v) => v.trim());

type Props = {
  mode: "create" | "edit";
  initialUrl?: string;
  base?: Product | null;
  /** Données lues depuis la page de l'utilisateur (à vérifier avant création). */
  prefill?: ManualProductInput | null;
  onSubmit: (p: Product) => void;
  onCancel: () => void;
};

/**
 * Formulaire unique pour (1) saisir un produit à la main quand l'import automatique échoue ou
 * n'existe pas, et (2) compléter / corriger un produit importé (prix, variantes, images).
 */
export function ProductEditor({
  mode,
  initialUrl,
  base = null,
  prefill = null,
  onSubmit,
  onCancel,
}: Props) {
  const { t } = useApp();
  const toast = useToast();

  const [url, setUrl] = useState(base?.sourceUrl ?? prefill?.sourceUrl ?? initialUrl ?? "");
  const [title, setTitle] = useState(base?.title ?? prefill?.title ?? "");
  const [titleOriginal, setTitleOriginal] = useState(
    base?.titleOriginal ?? prefill?.titleOriginal ?? "",
  );
  const [description, setDescription] = useState(base?.description ?? prefill?.description ?? "");
  const [price, setPrice] = useState(
    base?.price
      ? String(base.price.min).replace(".", ",")
      : prefill?.price
        ? String(prefill.price).replace(".", ",")
        : "",
  );
  const [currency, setCurrency] = useState(base?.currency ?? prefill?.currency ?? "CNY");
  const [imagesText, setImagesText] = useState((base?.images ?? prefill?.images ?? []).join("\n"));
  const [options, setOptions] = useState<OptionRow[]>(() =>
    base && base.options.length > 0
      ? base.options.map((o) => ({
          key: `o${++rowSeq}`,
          name: o.name,
          valuesText: o.values.map((v) => v.label).join(", "),
          originals: o.values.every((v) => v.labelOriginal === undefined)
            ? null
            : o.values.map((v) => v.labelOriginal ?? v.label),
        }))
      : (prefill?.options ?? []).map((o) => newRow(o.name, o.values.join(", "))),
  );
  const [errors, setErrors] = useState<Partial<Record<ManualFieldError, string>>>({});
  const [translating, setTranslating] = useState(false);

  const errText = (field: ManualFieldError) => {
    const code = errors[field];
    return code ? t(`cn.err.${code}` as Parameters<typeof t>[0]) : null;
  };

  const priceNumber = useMemo(() => (price.trim() === "" ? null : parseAmount(price)), [price]);

  const updateOption = (key: string, patch: Partial<OptionRow>) =>
    setOptions((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (price.trim() !== "" && priceNumber === null) {
      setErrors({ price: "INVALID_PRICE" });
      return;
    }
    const result = buildManualProduct(
      {
        sourceUrl: url,
        title,
        titleOriginal,
        description,
        price: priceNumber,
        currency,
        images: imagesText.split("\n"),
        options: options.map((o) => ({
          name: o.name,
          values: splitValues(o.valuesText),
          ...(o.originals ? { originals: o.originals } : {}),
        })),
      },
      { base },
    );
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.product);
  };

  const translate = async () => {
    const valuesPerOption = options.map((o) => splitValues(o.valuesText));
    const texts = [title, description, ...options.map((o) => o.name), ...valuesPerOption.flat()];
    if (texts.every((x) => !x.trim())) return;
    setTranslating(true);
    try {
      const res = await translateTextsFn({ data: { texts } });
      if (!res.ok) {
        toast.push("error", res.message);
        return;
      }
      let i = 0;
      const out = res.texts;
      const nextTitle = out[i++] ?? title;
      const nextDesc = out[i++] ?? description;
      if (nextTitle && nextTitle !== title) {
        setTitleOriginal((prev) => prev || title);
        setTitle(nextTitle);
      }
      setDescription(nextDesc);
      const names = options.map(() => out[i++] ?? "");
      setOptions((rows) =>
        rows.map((row, idx) => {
          const src = valuesPerOption[idx] ?? [];
          const translated = src.map((v, j) => out[i + j] ?? v);
          i += src.length;
          const changed = translated.some((v, j) => v !== src[j]);
          return {
            ...row,
            name: names[idx] || row.name,
            valuesText: translated.join(", "),
            originals: changed ? src : row.originals,
          };
        }),
      );
      toast.push(
        res.complete ? "success" : "info",
        res.complete ? t("cn.editor.translated") : t("cn.editor.translatedPartial"),
      );
    } catch {
      toast.push("error", t("cn.err.NETWORK"));
    } finally {
      setTranslating(false);
    }
  };

  const FieldError = ({ field }: { field: ManualFieldError }) =>
    errors[field] ? (
      <span role="alert" className="block text-xs text-destructive">
        {errText(field)}
      </span>
    ) : null;

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            {mode === "create" ? t("cn.editor.title.create") : t("cn.editor.title.edit")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "create" ? t("cn.editor.subtitle.create") : t("cn.editor.subtitle.edit")}
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className={labelCls}>{t("cn.editor.url")}</span>
          <input
            className={inputCls}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            readOnly={base !== null}
            placeholder="https://item.taobao.com/item.htm?id=…"
            inputMode="url"
            autoComplete="off"
            aria-invalid={Boolean(errors.url)}
          />
          <FieldError field="url" />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className={labelCls}>{t("cn.editor.name")}</span>
            <input
              className={inputCls}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-invalid={Boolean(errors.title)}
            />
            <FieldError field="title" />
          </label>
          <label className="block space-y-1.5">
            <span className={labelCls}>{t("cn.editor.nameOriginal")}</span>
            <input
              className={inputCls}
              value={titleOriginal}
              onChange={(e) => setTitleOriginal(e.target.value)}
              placeholder="跑步鞋"
            />
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <label className="block space-y-1.5">
            <span className={labelCls}>{t("cn.editor.price")}</span>
            <input
              className={`${inputCls} nums`}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="90"
              aria-invalid={Boolean(errors.price)}
            />
            <FieldError field="price" />
          </label>
          <label className="block space-y-1.5">
            <span className={labelCls}>{t("cn.editor.currency")}</span>
            <select
              className={inputCls}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {!SUPPORTED_CURRENCIES.some((c) => c === currency) ? (
                <option value={currency}>{currency}</option>
              ) : null}
            </select>
            <FieldError field="currency" />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className={labelCls}>{t("cn.editor.images")}</span>
          <textarea
            className={`${inputCls} min-h-24 resize-y font-mono text-xs`}
            value={imagesText}
            onChange={(e) => setImagesText(e.target.value)}
            placeholder="https://…/photo1.jpg"
            aria-invalid={Boolean(errors.images)}
          />
          <span className="block text-xs text-muted-foreground">{t("cn.editor.images.hint")}</span>
          <FieldError field="images" />
        </label>

        <label className="block space-y-1.5">
          <span className={labelCls}>{t("cn.editor.description")}</span>
          <textarea
            className={`${inputCls} min-h-20 resize-y`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>

        <fieldset className="space-y-3">
          <legend className={labelCls}>{t("cn.editor.options")}</legend>
          <p className="text-xs text-muted-foreground">{t("cn.editor.options.hint")}</p>
          {options.map((o) => (
            <div
              key={o.key}
              className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-border bg-secondary/20 p-2 sm:grid-cols-[10rem_1fr_auto]"
            >
              <input
                className={`${inputCls} col-span-2 sm:col-span-1`}
                value={o.name}
                onChange={(e) => updateOption(o.key, { name: e.target.value })}
                placeholder={t("cn.editor.option.name")}
                aria-label={t("cn.editor.option.name")}
              />
              <input
                className={inputCls}
                value={o.valuesText}
                onChange={(e) =>
                  updateOption(o.key, { valuesText: e.target.value, originals: null })
                }
                placeholder={t("cn.editor.option.values")}
                aria-label={t("cn.editor.option.values")}
              />
              <button
                type="button"
                aria-label={t("cn.editor.option.remove")}
                onClick={() => setOptions((rows) => rows.filter((r) => r.key !== o.key))}
                className="grid size-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <FieldError field="options" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => setOptions((r) => [...r, newRow(t("cn.editor.preset.size"))])}
            >
              <Plus className="size-4" /> {t("cn.editor.preset.size")}
            </button>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => setOptions((r) => [...r, newRow(t("cn.editor.preset.color"))])}
            >
              <Plus className="size-4" /> {t("cn.editor.preset.color")}
            </button>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => setOptions((r) => [...r, newRow()])}
              disabled={options.length >= 6}
            >
              <Plus className="size-4" /> {t("cn.editor.option.add")}
            </button>
          </div>
        </fieldset>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" className={secondaryBtn} onClick={translate} disabled={translating}>
            {translating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Languages className="size-4" />
            )}
            {t("cn.editor.translate")}
          </button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className={secondaryBtn} onClick={onCancel}>
              {t("common.cancel")}
            </button>
            <button type="submit" className={primaryBtn}>
              {mode === "create" ? t("cn.editor.submit.create") : t("cn.editor.submit.edit")}
            </button>
          </div>
        </div>
      </form>
    </Card>
  );
}
