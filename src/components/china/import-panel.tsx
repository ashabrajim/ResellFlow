import { useEffect, useRef, useState } from "react";
import { Bookmark, ClipboardPaste, Link2, Loader2, PenLine, Search, Trash2, X } from "lucide-react";
import { bookmarkletHref, parseCapture } from "@/lib/china/page-capture";
import type { ManualProductInput } from "@/lib/china/product";
import { PLATFORMS } from "@/lib/china/platforms";
import { extractUrlCandidate } from "@/lib/china/url";
import { checkImportUrl } from "@/lib/china/url";
import { formatOriginal } from "@/lib/china/money";
import type { Product } from "@/lib/china/types";
import { importProductFn } from "@/backend/china/functions";
import { useApp } from "../app-provider";
import { useChina } from "../china-provider";
import { Card, useToast } from "../ui-kit";
import { inputCls, labelCls, primaryBtn, secondaryBtn } from "./styles";

type Props = {
  onImported: (p: Product) => void;
  onManual: (url: string) => void;
  onPrefill: (input: ManualProductInput) => void;
};

type Failure = { message: string; url: string };

export function ImportPanel({ onImported, onManual, onPrefill }: Props) {
  const { t } = useApp();
  const toast = useToast();
  const { rememberProduct, history, forgetProduct, clearHistory, setCurrent } = useChina();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [captureText, setCaptureText] = useState("");
  const [captureError, setCaptureError] = useState<string | null>(null);
  const bookmarkRef = useRef<HTMLAnchorElement>(null);

  // React refuse les href « javascript: » : on pose l'attribut à la main (le favori est glissé par l'utilisateur).
  useEffect(() => {
    bookmarkRef.current?.setAttribute("href", bookmarkletHref());
  }, []);

  const copyScript = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletHref());
      toast.push("success", t("cn.capture.scriptCopied"));
    } catch {
      toast.push("error", t("cn.checkout.copyFail"));
    }
  };

  const applyCapture = () => {
    const r = parseCapture(captureText);
    if (!r.ok) {
      setCaptureError(t(`cn.capture.err.${r.code}` as Parameters<typeof t>[0]));
      return;
    }
    setCaptureError(null);
    onPrefill(r.input);
  };

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setValue(text);
    } catch {
      // permission refusée : l'utilisateur peut coller manuellement
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setFailure(null);
    const candidate = extractUrlCandidate(value) ?? value.trim();
    const check = checkImportUrl(value);
    if (!check.ok) {
      setFailure({
        message: t(`cn.import.err.${check.code}` as Parameters<typeof t>[0]),
        url: extractUrlCandidate(value) ?? "",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await importProductFn({ data: { url: candidate } });
      if (res.ok) {
        rememberProduct(res.product);
        if (res.cached) toast.push("info", t("cn.import.cached"));
        onImported(res.product);
      } else {
        setFailure({ message: res.message, url: res.sourceUrl ?? candidate });
      }
    } catch {
      setFailure({ message: t("cn.err.NETWORK"), url: candidate });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form onSubmit={submit} className="space-y-3" noValidate>
          <label className="block space-y-1.5">
            <span className={labelCls}>{t("cn.import.label")}</span>
            <div className="relative">
              <Link2
                className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"
                aria-hidden
              />
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={2}
                maxLength={4000}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder={t("cn.import.placeholder")}
                aria-invalid={failure !== null}
                aria-describedby={failure ? "cn-import-error" : undefined}
                className={`${inputCls} resize-y pl-9`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
            </div>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              className={`${primaryBtn} sm:min-w-44`}
              disabled={loading || !value.trim()}
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Search className="size-4" aria-hidden />
              )}
              {loading ? t("cn.import.loading") : t("cn.import.button")}
            </button>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => void paste()}
              disabled={loading}
            >
              <ClipboardPaste className="size-4" aria-hidden /> {t("cn.import.paste")}
            </button>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => onManual(extractUrlCandidate(value) ?? "")}
              disabled={loading}
            >
              <PenLine className="size-4" aria-hidden /> {t("cn.import.manual")}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{t("cn.import.manualHint")}</p>

          <div aria-live="polite">
            {loading ? (
              <div className="space-y-2" role="status">
                <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
                </div>
                <span className="sr-only">{t("cn.import.loading")}</span>
              </div>
            ) : null}
            {failure ? (
              <div
                id="cn-import-error"
                role="alert"
                className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground"
              >
                <p>{failure.message}</p>
                <p className="text-xs text-muted-foreground">{t("cn.import.failureHint")}</p>
                <button
                  type="button"
                  className={secondaryBtn}
                  onClick={() => onManual(failure.url)}
                >
                  <PenLine className="size-4" aria-hidden /> {t("cn.import.manual")}
                </button>
              </div>
            ) : null}
          </div>
        </form>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("cn.capture.title")}</h2>
        <p className="text-xs text-muted-foreground">{t("cn.capture.intro")}</p>
        <div className="space-y-3 text-sm text-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <span>{t("cn.capture.step1")}</span>
            <a
              ref={bookmarkRef}
              draggable
              onClick={(e) => e.preventDefault()}
              className="inline-flex cursor-grab items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
            >
              <Bookmark className="size-4" aria-hidden /> {t("cn.capture.bookmark")}
            </a>
            <button
              type="button"
              className={`${secondaryBtn} !py-1.5 text-xs`}
              onClick={() => void copyScript()}
            >
              {t("cn.capture.copyScript")}
            </button>
          </div>
          <p>{t("cn.capture.step2")}</p>
          <p>{t("cn.capture.step3")}</p>
        </div>
        <label className="block space-y-1.5">
          <span className={labelCls}>{t("cn.capture.paste")}</span>
          <textarea
            value={captureText}
            onChange={(e) => setCaptureText(e.target.value)}
            rows={3}
            spellCheck={false}
            placeholder='{"v":1,"url":"https://…"}'
            className={`${inputCls} resize-y font-mono text-xs`}
          />
        </label>
        {captureError ? (
          <p role="alert" className="text-xs text-destructive">
            {captureError}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primaryBtn} onClick={applyCapture}>
            {t("cn.capture.button")}
          </button>
          <p className="text-xs text-muted-foreground">{t("cn.capture.note")}</p>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("cn.import.platforms")}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {PLATFORMS.map((p) => (
            <li key={p.id} className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                {p.label}
                <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                  {t(`cn.import.status.${p.status}` as Parameters<typeof t>[0])}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{p.limits}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">{t("cn.import.platforms.note")}</p>
      </Card>

      {history.length > 0 ? (
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-foreground">{t("cn.import.history")}</h2>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
              onClick={clearHistory}
            >
              <Trash2 className="size-3.5" aria-hidden /> {t("cn.import.history.clear")}
            </button>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {history.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-lg border border-border p-2"
              >
                <button
                  type="button"
                  onClick={() => {
                    setCurrent(p);
                    onImported(p);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${t("cn.import.history.open")} : ${p.title}`}
                >
                  <span className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                    {p.images[0] ? (
                      <img
                        src={p.images[0]}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="size-full object-cover"
                      />
                    ) : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {p.title}
                    </span>
                    <span className="nums block truncate text-xs text-muted-foreground">
                      {p.platformLabel}
                      {p.price ? ` · ${formatOriginal(p.price.min, p.currency)}` : ""}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={t("cn.import.history.remove")}
                  onClick={() => forgetProduct(p.id)}
                  className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
