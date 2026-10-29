import { cn } from "@/lib/utils";
import type { ItemStatus } from "./app-provider";
import { useApp } from "./app-provider";
import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card shadow-sm shadow-black/[0.02]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-pretty text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
        {title}
      </h1>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

export function FreeBadge({ className }: { className?: string }) {
  const { t } = useApp();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-primary" />
      {t("app.free")}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        checked ? "bg-primary" : "bg-secondary",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

const statusStyles: Record<ItemStatus, string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-600",
  queued: "border-amber-300 bg-amber-50 text-amber-700",
  online: "border-accent/30 bg-accent/10 text-accent",
  sold: "border-success/25 bg-success/10 text-success",
};

export function StatusBadge({ status }: { status: ItemStatus }) {
  const { t } = useApp();
  const labelKey = `inv.status.${status}` as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        statusStyles[status],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {t(labelKey)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Toast notifications — lightweight in-app feedback, replaces native
// alert()/confirm() popups so every action (processing, download, error…)
// gets a clean, dismissible, on-brand notification instead of a silent no-op
// or a browser-native dialog.
// ---------------------------------------------------------------------------
type ToastKind = "success" | "error" | "info";
type ToastItem = { id: string; kind: ToastKind; message: string };

type ToastContextValue = { push: (kind: ToastKind, message: string) => void };
const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const icons: Record<ToastKind, typeof CheckCircle2> = {
    success: CheckCircle2,
    error: XCircle,
    info: Info,
  };
  const styles: Record<ToastKind, string> = {
    success: "border-success/25 bg-white text-success [&_svg]:text-success",
    error: "border-destructive/25 bg-white text-destructive [&_svg]:text-destructive",
    info: "border-primary/25 bg-white text-primary [&_svg]:text-primary",
  };

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 sm:items-end sm:right-4 sm:left-auto">
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div
              key={t.id}
              style={{ animation: "toast-in 0.2s ease-out" }}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg shadow-black/[0.06]",
                styles[t.kind],
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1 text-foreground">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-muted-foreground transition hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
