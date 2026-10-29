import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  PackageOpen,
  Rocket,
  X,
  Sparkles,
  CheckCircle2,
  Trash2,
  Store,
  ImagePlus,
  Check,
  Pencil,
} from "lucide-react";
import { useApp, itemNetProfit } from "../app-provider";
import { useNav } from "../app-shell";
import { Card, SectionHeader, StatusBadge } from "../ui-kit";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function InventorySection() {
  const { t, lang, items, addItem, publishItems, markSold, updateActualPrice, removeItem } =
    useApp();
  const { pendingAction, consumeAction } = useNav();
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);

  useEffect(() => {
    if (pendingAction === "add") {
      setModalOpen(true);
      consumeAction();
    }
  }, [pendingAction, consumeAction]);

  const publishable = useMemo(
    () => items.filter((i) => i.status === "draft" || i.status === "online").map((i) => i.id),
    [items],
  );

  const toggleSelect = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handlePublish = () => {
    if (selected.length === 0) return;
    publishItems(selected);
    setSelected([]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeader title={t("inv.title")} subtitle={t("inv.subtitle")} />
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
        >
          <Plus className="size-4" />
          {t("inv.add")}
        </button>
      </div>

      {/* Publish console */}
      {items.length > 0 ? (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary">
              <Rocket className="size-4" />
            </span>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{selected.length}</span>{" "}
              {t("inv.selected")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(selected.length === publishable.length ? [] : publishable)}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
              {selected.length === publishable.length && publishable.length > 0
                ? t("common.close")
                : t("common.all")}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={selected.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
            >
              <Rocket className="size-4" />
              {t("inv.publishAuto")}
            </button>
          </div>
        </Card>
      ) : null}

      {items.length === 0 ? (
        <EmptyState onAdd={() => setModalOpen(true)} />
      ) : (
        <Card className="overflow-hidden">
          {/* header */}
          <div className="hidden grid-cols-[auto_auto_1.4fr_0.5fr_1fr_1fr_1fr_1.2fr_auto] gap-3 border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
            <span className="w-5" />
            <span />
            <span>{t("inv.col.item")}</span>
            <span>{t("inv.col.qty")}</span>
            <span>{t("inv.col.buy")}</span>
            <span>{t("inv.col.sell")}</span>
            <span>{t("inv.col.shipping")}</span>
            <span>{t("inv.col.margin")}</span>
            <span />
          </div>
          <ul>
            {items.map((it) => {
              const isSel = selected.includes(it.id);
              const canSelect = it.status === "draft" || it.status === "online";
              const net = itemNetProfit(it);
              const isEditingThis = editingPrice === it.id;
              return (
                <li
                  key={it.id}
                  className="grid grid-cols-2 items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0 md:grid-cols-[auto_auto_1.4fr_0.5fr_1fr_1fr_1fr_1.2fr_auto]"
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    disabled={!canSelect}
                    onChange={() => toggleSelect(it.id)}
                    aria-label={`Select ${it.name}`}
                    className="size-4 accent-[#1f5d46] disabled:opacity-30"
                  />
                  <div className="hidden size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-secondary/40 md:block">
                    {it.photoUrl ? (
                      <img src={it.photoUrl} alt={it.name} className="size-full object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-muted-foreground">
                        <ImagePlus className="size-4" />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{it.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[it.brand, it.size].filter(Boolean).join(" · ") || it.category}
                    </p>
                    <span className="mt-0.5 inline-block md:hidden">
                      <StatusBadge status={it.status} />
                    </span>
                  </div>
                  <span className="text-sm text-muted-foreground">×{it.quantity}</span>
                  <span className="nums text-sm text-muted-foreground">
                    {formatCurrency(it.buyPrice, lang)}
                  </span>
                  {it.status === "sold" ? (
                    isEditingThis ? (
                      <PriceEditor
                        value={it.actualPrice ?? it.sellPrice}
                        onSave={(v) => {
                          updateActualPrice(it.id, v);
                          setEditingPrice(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingPrice(it.id)}
                        className="group flex items-center gap-1 text-left text-sm text-foreground"
                        title={t("inv.editActual")}
                      >
                        <span className="nums">
                          {formatCurrency(it.actualPrice ?? it.sellPrice, lang)}
                        </span>
                        <Pencil className="size-3 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                      </button>
                    )
                  ) : (
                    <span className="nums text-sm text-foreground">
                      {formatCurrency(it.sellPrice, lang)}
                    </span>
                  )}
                  <span className="nums text-sm text-muted-foreground">
                    {formatCurrency(it.shippingFee, lang)}
                  </span>
                  <span
                    className={cn(
                      "nums text-sm font-medium",
                      net >= 0 ? "text-primary" : "text-destructive",
                    )}
                  >
                    {formatCurrency(net, lang)}
                  </span>
                  <span className="hidden md:block">
                    <StatusBadge status={it.status} />
                  </span>
                  <div className="col-span-2 flex items-center justify-end gap-1 md:col-span-1">
                    {it.status !== "sold" ? (
                      <button
                        type="button"
                        onClick={() => markSold(it.id)}
                        title={t("inv.markSold")}
                        className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-accent/10 hover:text-accent"
                      >
                        <CheckCircle2 className="size-4" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeItem(it.id)}
                      className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <AnimatePresence>
        {modalOpen ? <AddItemModal onClose={() => setModalOpen(false)} onAdd={addItem} /> : null}
      </AnimatePresence>
    </div>
  );
}

function PriceEditor({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <span className="flex items-center gap-1">
      <input
        ref={ref}
        type="number"
        min="0"
        step="0.01"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSave(Number(v) || 0)}
        className="w-20 rounded-md border border-primary/40 bg-secondary/40 px-1.5 py-1 text-sm text-foreground outline-none"
      />
      <button
        type="button"
        onClick={() => onSave(Number(v) || 0)}
        className="grid size-6 shrink-0 place-items-center rounded-md bg-primary/15 text-primary"
      >
        <Check className="size-3.5" />
      </button>
    </span>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  const { t } = useApp();
  return (
    <Card className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
        <PackageOpen className="size-7" />
      </span>
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-foreground">{t("inv.empty.title")}</h3>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{t("inv.empty.desc")}</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
      >
        <Plus className="size-4" />
        {t("inv.empty.cta")}
      </button>
    </Card>
  );
}

const CATEGORIES = [
  "Vêtements",
  "Chaussures",
  "Accessoires",
  "Sacs",
  "High-tech",
  "Maison",
] as const;
const CONDITIONS = [
  "Neuf avec étiquette",
  "Neuf sans étiquette",
  "Très bon état",
  "Bon état",
  "Satisfaisant",
] as const;
const PARCELS = ["Petit", "Moyen", "Grand"] as const;

export function AddItemModal({
  onClose,
  onAdd,
  initial,
}: {
  onClose: () => void;
  onAdd: ReturnType<typeof useApp>["addItem"];
  initial?: Partial<{
    name: string;
    buyPrice: number;
    sellPrice: number;
    shippingFee: number;
    quantity: number;
  }>;
}) {
  const { t } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    brand: "",
    category: CATEGORIES[0] as string,
    condition: CONDITIONS[2] as string,
    size: "",
    photoUrl: null as string | null,
    quantity: String(initial?.quantity ?? 1),
    buyPrice: initial?.buyPrice != null ? String(initial.buyPrice) : "",
    sellPrice: initial?.sellPrice != null ? String(initial.sellPrice) : "",
    shippingFee: initial?.shippingFee != null ? String(initial.shippingFee) : "",
    parcel: PARCELS[0] as string,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const onPhotoPick = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    set("photoUrl", URL.createObjectURL(file));
  };

  const autoDescription = useMemo(() => {
    if (!form.name) return "";
    const tags = [form.brand, form.category, form.condition]
      .filter(Boolean)
      .map((s) => "#" + String(s).toLowerCase().replace(/\s+/g, ""))
      .join(" ");
    return `${form.name}${form.brand ? " " + form.brand : ""}${form.size ? " — " + form.size : ""}. ${form.condition}. ${tags}`;
  }, [form]);

  const canSubmit = form.name.trim() && form.sellPrice;

  const submit = () => {
    if (!canSubmit) return;
    onAdd({
      name: form.name.trim(),
      brand: form.brand.trim(),
      category: form.category,
      condition: form.condition,
      size: form.size.trim(),
      photoUrl: form.photoUrl,
      quantity: Math.max(1, Number(form.quantity) || 1),
      buyPrice: Number(form.buyPrice) || 0,
      sellPrice: Number(form.sellPrice) || 0,
      shippingFee: Number(form.shippingFee) || 0,
      parcel: form.parcel,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-t-2xl border border-border bg-card sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">{t("inv.add")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-border bg-secondary/40 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
            >
              {form.photoUrl ? (
                <img src={form.photoUrl} alt="" className="size-full object-cover" />
              ) : (
                <ImagePlus className="size-5" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onPhotoPick(e.target.files)}
            />
            <div className="text-xs text-muted-foreground">{t("inv.form.photo")}</div>
          </div>
          <Field label={t("inv.form.name")}>
            <input
              className={inputCls}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Nike Air Max 90"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("inv.form.brand")}>
              <input
                className={inputCls}
                value={form.brand}
                onChange={(e) => set("brand", e.target.value)}
                placeholder="Nike"
              />
            </Field>
            <Field label={t("inv.form.size")}>
              <input
                className={inputCls}
                value={form.size}
                onChange={(e) => set("size", e.target.value)}
                placeholder="L / 42"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("inv.form.category")}>
              <select
                className={inputCls}
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("inv.form.condition")}>
              <select
                className={inputCls}
                value={form.condition}
                onChange={(e) => set("condition", e.target.value)}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("inv.form.quantity")}>
              <input
                className={inputCls}
                type="number"
                min="1"
                step="1"
                value={form.quantity}
                onChange={(e) => set("quantity", e.target.value)}
                placeholder="1"
              />
            </Field>
            <Field label={t("inv.form.buy")}>
              <input
                className={inputCls}
                type="number"
                min="0"
                value={form.buyPrice}
                onChange={(e) => set("buyPrice", e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label={t("inv.form.sell")}>
              <input
                className={inputCls}
                type="number"
                min="0"
                value={form.sellPrice}
                onChange={(e) => set("sellPrice", e.target.value)}
                placeholder="0"
              />
            </Field>
          </div>
          {Number(form.quantity) > 1 ? (
            <p className="text-xs text-muted-foreground">{t("inv.form.qtyHint")}</p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("inv.form.shipping")}>
              <input
                className={inputCls}
                type="number"
                min="0"
                value={form.shippingFee}
                onChange={(e) => set("shippingFee", e.target.value)}
                placeholder="0"
              />
            </Field>
            <Field label={t("inv.form.parcel")}>
              <select
                className={inputCls}
                value={form.parcel}
                onChange={(e) => set("parcel", e.target.value)}
              >
                {PARCELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Auto listing preview */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-primary">
              <Sparkles className="size-4" />
              <span className="text-xs font-semibold">{t("inv.autogen")}</span>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {autoDescription || t("inv.autogen.desc")}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3.5 py-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
          >
            <Store className="size-4" />
            {t("common.add")}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
