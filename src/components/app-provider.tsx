import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { translations, type Lang, type TranslationKey } from "@/lib/i18n";

export type ItemStatus = "draft" | "queued" | "online" | "sold";

export type InventoryItem = {
  id: string;
  name: string;
  brand: string;
  category: string;
  condition: string;
  size: string;
  photoUrl: string | null;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  actualPrice: number | null;
  shippingFee: number;
  parcel: string;
  status: ItemStatus;
  createdAt: number;
  soldAt: number | null;
};

export type Expense = {
  id: string;
  label: string;
  amount: number;
  createdAt: number;
};

export type Activity = {
  id: string;
  message: string;
  createdAt: number;
};

type Settings = {
  voiceReplies: boolean;
  autoSync: boolean;
  saleNotifs: boolean;
};

type PersistedState = {
  items: InventoryItem[];
  expenses: Expense[];
  activities: Activity[];
  settings: Settings;
  lang: Lang;
  vintedConnected: boolean;
  shopHandle: string;
};

const STORAGE_KEY = "resellflow.state.v1";

function loadPersisted(): Partial<PersistedState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Partial<PersistedState>;
  } catch {
    return null;
  }
}

type AppContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  hydrated: boolean;
  // vinted
  vintedConnected: boolean;
  shopHandle: string;
  connectVinted: (handle: string) => void;
  disconnectVinted: () => void;
  // inventory
  items: InventoryItem[];
  addItem: (item: {
    name: string;
    brand: string;
    category: string;
    condition: string;
    size: string;
    photoUrl: string | null;
    quantity: number;
    buyPrice: number;
    sellPrice: number;
    shippingFee: number;
    parcel: string;
  }) => void;
  publishItems: (ids: string[]) => void;
  markSold: (id: string, actualPrice?: number) => void;
  updateActualPrice: (id: string, actualPrice: number) => void;
  removeItem: (id: string) => void;
  // expenses
  expenses: Expense[];
  addExpense: (label: string, amount: number) => void;
  removeExpense: (id: string) => void;
  // activity
  activities: Activity[];
  // settings
  settings: Settings;
  updateSetting: (key: keyof Settings, value: boolean) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const DEFAULT_SETTINGS: Settings = {
  voiceReplies: true,
  autoSync: false,
  saleNotifs: true,
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [lang, setLang] = useState<Lang>("fr");
  const [vintedConnected, setVintedConnected] = useState(false);
  const [shopHandle, setShopHandle] = useState("");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Hydrate once on mount (client only — avoids SSR/client markup mismatch)
  useEffect(() => {
    const persisted = loadPersisted();
    if (persisted) {
      if (persisted.lang) setLang(persisted.lang);
      if (typeof persisted.vintedConnected === "boolean")
        setVintedConnected(persisted.vintedConnected);
      if (persisted.shopHandle) setShopHandle(persisted.shopHandle);
      if (persisted.items) setItems(persisted.items);
      if (persisted.expenses) setExpenses(persisted.expenses);
      if (persisted.activities) setActivities(persisted.activities);
      if (persisted.settings) setSettings({ ...DEFAULT_SETTINGS, ...persisted.settings });
    }
    setHydrated(true);
  }, []);

  // Persist on every change, after hydration
  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (!hydrated) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    const state: PersistedState = {
      items,
      expenses,
      activities,
      settings,
      lang,
      vintedConnected,
      shopHandle,
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage unavailable (private mode / quota) — fail silently, app still works in-memory
    }
  }, [hydrated, items, expenses, activities, settings, lang, vintedConnected, shopHandle]);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      let str: string = translations[lang][key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(`{${k}}`, String(v));
        }
      }
      return str;
    },
    [lang],
  );

  const pushActivity = useCallback((message: string) => {
    setActivities((prev) => [{ id: uid(), message, createdAt: Date.now() }, ...prev].slice(0, 20));
  }, []);

  const connectVinted = useCallback(
    (handle: string) => {
      setVintedConnected(true);
      setShopHandle(handle);
      pushActivity(lang === "fr" ? `Boutique @${handle} connectée` : `Shop @${handle} connected`);
    },
    [lang, pushActivity],
  );

  const disconnectVinted = useCallback(() => {
    setVintedConnected(false);
    setShopHandle("");
  }, []);

  const addItem = useCallback<AppContextValue["addItem"]>(
    (item) => {
      const newItem: InventoryItem = {
        ...item,
        id: uid(),
        actualPrice: null,
        status: "draft",
        createdAt: Date.now(),
        soldAt: null,
      };
      setItems((prev) => [newItem, ...prev]);
      pushActivity(lang === "fr" ? `Article ajouté : ${item.name}` : `Item added: ${item.name}`);
    },
    [lang, pushActivity],
  );

  const publishItems = useCallback(
    (ids: string[]) => {
      setItems((prev) =>
        prev.map((it) => (ids.includes(it.id) ? { ...it, status: "queued" } : it)),
      );
      // simulate queue -> online transition
      setTimeout(() => {
        setItems((prev) =>
          prev.map((it) => (ids.includes(it.id) ? { ...it, status: "online" } : it)),
        );
      }, 1600);
      pushActivity(
        lang === "fr"
          ? `${ids.length} article(s) publié(s) sur Vinted`
          : `${ids.length} item(s) published to Vinted`,
      );
    },
    [lang, pushActivity],
  );

  const markSold = useCallback(
    (id: string, actualPrice?: number) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === id
            ? {
                ...it,
                status: "sold",
                soldAt: Date.now(),
                actualPrice: actualPrice ?? it.sellPrice,
              }
            : it,
        ),
      );
      const sold = items.find((i) => i.id === id);
      if (sold) {
        const price = actualPrice ?? sold.sellPrice;
        pushActivity(
          lang === "fr" ? `Vente : ${sold.name} (+${price} €)` : `Sale: ${sold.name} (+€${price})`,
        );
      }
    },
    [items, lang, pushActivity],
  );

  const updateActualPrice = useCallback((id: string, actualPrice: number) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, actualPrice } : it)));
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const addExpense = useCallback((label: string, amount: number) => {
    setExpenses((prev) => [{ id: uid(), label, amount, createdAt: Date.now() }, ...prev]);
  }, []);

  const removeExpense = useCallback((id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const updateSetting = useCallback((key: keyof Settings, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      lang,
      setLang,
      t,
      hydrated,
      vintedConnected,
      shopHandle,
      connectVinted,
      disconnectVinted,
      items,
      addItem,
      publishItems,
      markSold,
      updateActualPrice,
      removeItem,
      expenses,
      addExpense,
      removeExpense,
      activities,
      settings,
      updateSetting,
    }),
    [
      lang,
      t,
      hydrated,
      vintedConnected,
      shopHandle,
      connectVinted,
      disconnectVinted,
      items,
      addItem,
      publishItems,
      markSold,
      updateActualPrice,
      removeItem,
      expenses,
      addExpense,
      removeExpense,
      activities,
      settings,
      updateSetting,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

const PLATFORM_FEE_RATE = 0.05;

/** Net profit for a whole inventory line (all units), using the actual sale price when sold. */
export function itemNetProfit(item: InventoryItem) {
  const unitRevenue = item.actualPrice ?? item.sellPrice;
  const revenue = unitRevenue * item.quantity;
  const cost = item.buyPrice * item.quantity;
  const platformFee = revenue * PLATFORM_FEE_RATE;
  return revenue - cost - item.shippingFee - platformFee;
}

// Derived selectors
export function useMetrics() {
  const { items, expenses } = useApp();
  const sold = items.filter((i) => i.status === "sold");
  const revenue = sold.reduce((s, i) => s + (i.actualPrice ?? i.sellPrice) * i.quantity, 0);
  const cost = sold.reduce((s, i) => s + i.buyPrice * i.quantity, 0);
  const shipping = sold.reduce((s, i) => s + i.shippingFee, 0);
  const platformFees = revenue * PLATFORM_FEE_RATE;
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const grossProfit = revenue - cost;
  const netProfit = revenue - cost - shipping - platformFees - expenseTotal;
  const inStock = items.filter((i) => i.status !== "sold").reduce((s, i) => s + i.quantity, 0);
  const soldCount = sold.reduce((s, i) => s + i.quantity, 0);
  const avgMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const urssaf = revenue * 0.123;
  return {
    revenue,
    cost,
    shipping,
    platformFees,
    expenseTotal,
    grossProfit,
    netProfit,
    inStock,
    soldCount,
    avgMargin,
    urssaf,
  };
}
