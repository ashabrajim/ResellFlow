import {
  LayoutDashboard,
  Package,
  Store,
  BarChart3,
  Mic,
  Calculator,
  Truck,
  Settings,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";

export type SectionKey =
  | "dashboard"
  | "china"
  | "inventory"
  | "vinted"
  | "profit"
  | "voice"
  | "shipping"
  | "accounting"
  | "settings";

export type NavItem = {
  key: SectionKey;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  {
    key: "dashboard",
    labelKey: "nav.dashboard",
    descKey: "nav.dashboard.desc",
    icon: LayoutDashboard,
  },
  { key: "china", labelKey: "nav.china", descKey: "nav.china.desc", icon: ShoppingBag },
  { key: "inventory", labelKey: "nav.inventory", descKey: "nav.inventory.desc", icon: Package },
  { key: "vinted", labelKey: "nav.vinted", descKey: "nav.vinted.desc", icon: Store },
  { key: "profit", labelKey: "nav.profit", descKey: "nav.profit.desc", icon: BarChart3 },
  { key: "voice", labelKey: "nav.voice", descKey: "nav.voice.desc", icon: Mic },
  { key: "shipping", labelKey: "nav.shipping", descKey: "nav.shipping.desc", icon: Truck },
  {
    key: "accounting",
    labelKey: "nav.accounting",
    descKey: "nav.accounting.desc",
    icon: Calculator,
  },
  { key: "settings", labelKey: "nav.settings", descKey: "nav.settings.desc", icon: Settings },
];
