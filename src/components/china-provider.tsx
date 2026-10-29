import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  addToCart,
  cartCurrencies,
  cartTotals,
  removeLine,
  setLineQuantity,
  type AddResult,
  type CartTotals,
  type NewLineInput,
} from "@/lib/china/cart";
import {
  CHINA_STORAGE_KEY,
  EMPTY_PERSISTED,
  parsePersisted,
  pushHistory,
  serializePersisted,
} from "@/lib/china/storage";
import type { CartLine, Product, RateInfo } from "@/lib/china/types";
import { getRatesFn } from "@/backend/china/functions";

type RatesStatus = "idle" | "loading" | "ok" | "error";

type ChinaContextValue = {
  hydrated: boolean;
  // panier
  lines: CartLine[];
  units: number;
  totals: CartTotals;
  addProduct: (input: NewLineInput) => AddResult;
  setQuantity: (lineId: string, quantity: number) => void;
  removeFromCart: (lineId: string) => void;
  clearCart: () => void;
  // agent
  agentPhone: string;
  setAgentPhone: (v: string) => void;
  agentFeePercent: number;
  setAgentFeePercent: (v: number) => void;
  // produits
  current: Product | null;
  setCurrent: (p: Product | null) => void;
  history: Product[];
  rememberProduct: (p: Product) => void;
  forgetProduct: (id: string) => void;
  clearHistory: () => void;
  // taux
  rates: Record<string, RateInfo>;
  ratesStatus: RatesStatus;
  refreshRates: () => Promise<void>;
};

const ChinaContext = createContext<ChinaContextValue | null>(null);

export function ChinaProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [lines, setLines] = useState<CartLine[]>(EMPTY_PERSISTED.cart);
  const [agentPhone, setAgentPhone] = useState(EMPTY_PERSISTED.agentPhone);
  const [agentFeePercent, setAgentFeePercentState] = useState(EMPTY_PERSISTED.agentFeePercent);
  const [history, setHistory] = useState<Product[]>(EMPTY_PERSISTED.history);
  const [rates, setRates] = useState<Record<string, RateInfo>>(EMPTY_PERSISTED.rates);
  const [ratesStatus, setRatesStatus] = useState<RatesStatus>("idle");
  const [current, setCurrent] = useState<Product | null>(null);

  // Lecture unique au montage (client uniquement : évite les écarts SSR/client).
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(CHINA_STORAGE_KEY);
    } catch {
      // stockage indisponible : on démarre vide
    }
    const saved = parsePersisted(raw);
    setLines(saved.cart);
    setAgentPhone(saved.agentPhone || EMPTY_PERSISTED.agentPhone);
    setAgentFeePercentState(saved.agentFeePercent);
    setHistory(saved.history);
    setRates(saved.rates);
    setHydrated(true);
  }, []);

  // Sauvegarde à chaque changement, après hydratation.
  const skipFirstSave = useRef(true);
  useEffect(() => {
    if (!hydrated) return;
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    try {
      window.localStorage.setItem(
        CHINA_STORAGE_KEY,
        serializePersisted({
          version: 1,
          cart: lines,
          agentPhone,
          agentFeePercent,
          history,
          rates,
        }),
      );
    } catch {
      // quota / navigation privée : l'app continue en mémoire
    }
  }, [hydrated, lines, agentPhone, agentFeePercent, history, rates]);

  // Devises dont on a besoin : CNY toujours (plateformes chinoises) + celles du panier / du produit affiché.
  const neededKey = useMemo(() => {
    const set = new Set<string>(["CNY", ...cartCurrencies(lines)]);
    if (current && current.currency !== "EUR") set.add(current.currency);
    return [...set].sort().join(",");
  }, [lines, current]);

  const requestId = useRef(0);
  const refreshRates = useCallback(async () => {
    const currencies = neededKey.split(",").filter(Boolean);
    const id = ++requestId.current;
    setRatesStatus("loading");
    try {
      const res = await getRatesFn({ data: { currencies } });
      if (id !== requestId.current) return;
      if (res.ok) {
        setRates((prev) => ({ ...prev, ...res.rates }));
        setRatesStatus("ok");
      } else {
        setRatesStatus("error");
      }
    } catch {
      if (id === requestId.current) setRatesStatus("error");
    }
  }, [neededKey]);

  useEffect(() => {
    if (hydrated) void refreshRates();
  }, [hydrated, refreshRates]);

  const addProduct = useCallback(
    (input: NewLineInput): AddResult => {
      const res = addToCart(lines, input);
      if (res.ok) setLines(res.lines);
      return res;
    },
    [lines],
  );
  const setQuantity = useCallback(
    (lineId: string, q: number) => setLines((l) => setLineQuantity(l, lineId, q)),
    [],
  );
  const removeFromCart = useCallback(
    (lineId: string) => setLines((l) => removeLine(l, lineId)),
    [],
  );
  const clearCart = useCallback(() => setLines([]), []);
  const setAgentFeePercent = useCallback((v: number) => {
    setAgentFeePercentState(Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0);
  }, []);
  const rememberProduct = useCallback((p: Product) => setHistory((h) => pushHistory(h, p)), []);
  const forgetProduct = useCallback(
    (id: string) => setHistory((h) => h.filter((p) => p.id !== id)),
    [],
  );
  const clearHistory = useCallback(() => setHistory([]), []);

  const totals = useMemo(
    () => cartTotals(lines, rates, agentFeePercent),
    [lines, rates, agentFeePercent],
  );
  const units = totals.units;

  const value = useMemo<ChinaContextValue>(
    () => ({
      hydrated,
      lines,
      units,
      totals,
      addProduct,
      setQuantity,
      removeFromCart,
      clearCart,
      agentPhone,
      setAgentPhone,
      agentFeePercent,
      setAgentFeePercent,
      current,
      setCurrent,
      history,
      rememberProduct,
      forgetProduct,
      clearHistory,
      rates,
      ratesStatus,
      refreshRates,
    }),
    [
      hydrated,
      lines,
      units,
      totals,
      addProduct,
      setQuantity,
      removeFromCart,
      clearCart,
      agentPhone,
      agentFeePercent,
      setAgentFeePercent,
      current,
      history,
      rememberProduct,
      forgetProduct,
      clearHistory,
      rates,
      ratesStatus,
      refreshRates,
    ],
  );

  return <ChinaContext.Provider value={value}>{children}</ChinaContext.Provider>;
}

export function useChina() {
  const ctx = useContext(ChinaContext);
  if (!ctx) throw new Error("useChina must be used within ChinaProvider");
  return ctx;
}
