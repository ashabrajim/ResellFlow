import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "../app-provider";

/**
 * Galerie d'images produit. `referrerPolicy="no-referrer"` : les CDN chinois (alicdn…)
 * refusent souvent les images quand le Referer est un autre site.
 */
export function Gallery({ images, alt }: { images: string[]; alt: string }) {
  const { t } = useApp();
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());

  useEffect(() => {
    setIndex(0);
    setBroken(new Set());
  }, [images]);

  const count = images.length;
  const go = useCallback(
    (delta: number) => setIndex((i) => (count ? (i + delta + count) % count : 0)),
    [count],
  );
  const markBroken = (src: string) => setBroken((prev) => new Set(prev).add(src));

  if (count === 0) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-xl border border-dashed border-border bg-muted text-muted-foreground">
        <div className="flex flex-col items-center gap-2 text-xs">
          <ImageOff className="size-6" />
          {t("cn.gallery.none")}
        </div>
      </div>
    );
  }

  const current = images[Math.min(index, count - 1)] as string;

  return (
    <div
      className="space-y-3"
      tabIndex={0}
      role="group"
      aria-label={t("cn.gallery.label")}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(-1);
        if (e.key === "ArrowRight") go(1);
      }}
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted">
        {broken.has(current) ? (
          <div className="grid size-full place-items-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2 text-xs">
              <ImageOff className="size-6" />
              {t("cn.gallery.broken")}
            </div>
          </div>
        ) : (
          <img
            key={current}
            src={current}
            alt={alt}
            referrerPolicy="no-referrer"
            decoding="async"
            onError={() => markBroken(current)}
            className="size-full object-contain"
          />
        )}
        {count > 1 ? (
          <>
            <button
              type="button"
              aria-label={t("cn.gallery.prev")}
              onClick={() => go(-1)}
              className="absolute left-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/90 text-foreground shadow transition hover:bg-card"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label={t("cn.gallery.next")}
              onClick={() => go(1)}
              className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-card/90 text-foreground shadow transition hover:bg-card"
            >
              <ChevronRight className="size-4" />
            </button>
            <span className="nums absolute bottom-2 right-2 rounded-md bg-foreground/70 px-2 py-0.5 text-[11px] text-background">
              {Math.min(index, count - 1) + 1}/{count}
            </span>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {images.map((src, i) => (
            <li key={src} className="shrink-0">
              <button
                type="button"
                aria-label={`${t("cn.gallery.photo")} ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "block size-16 overflow-hidden rounded-lg border bg-muted transition",
                  i === index
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-border opacity-80 hover:opacity-100",
                )}
              >
                {broken.has(src) ? (
                  <span className="grid size-full place-items-center text-muted-foreground">
                    <ImageOff className="size-4" />
                  </span>
                ) : (
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    onError={() => markBroken(src)}
                    className="size-full object-cover"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
