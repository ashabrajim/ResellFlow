import type { Product } from "./types.ts";

export function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: "taobao:123456789",
    platform: "taobao",
    platformLabel: "Taobao",
    sourceUrl: "https://item.taobao.com/item.htm?id=123456789",
    itemId: "123456789",
    title: "Baskets de running",
    titleOriginal: "跑步鞋",
    description: null,
    descriptionOriginal: null,
    images: ["https://img.alicdn.com/a.jpg"],
    currency: "CNY",
    price: { min: 90, max: 90 },
    options: [
      { name: "Taille", values: [{ label: "41" }, { label: "42" }] },
      {
        name: "Couleur",
        values: [
          { label: "Noir", labelOriginal: "黑色" },
          { label: "Gris", labelOriginal: "灰色" },
        ],
      },
    ],
    variants: [],
    rating: null,
    reviews: [],
    availability: "unknown",
    seller: null,
    origin: "auto",
    fetchedAt: "2026-10-27T12:00:00.000Z",
    warnings: [],
    ...over,
  };
}
