import { formatEurCents, formatOriginal } from "./money.ts";
import type { CartTotals, LineTotals } from "./cart.ts";

// Méthode utilisée : lien « click-to-chat » officiel de WhatsApp (https://wa.me/<numéro>?text=…).
// Il OUVRE WhatsApp avec le message prérempli ; l'utilisateur doit encore appuyer sur « Envoyer ».
// L'application ne peut donc jamais affirmer qu'un message a été envoyé.

export type PhoneCheck =
  | { ok: true; digits: string; display: string }
  | { ok: false; code: "EMPTY" | "INVALID" | "LOCAL_FORMAT" | "LENGTH" };

/** Numéro au format international (E.164) -> chiffres seuls pour wa.me. */
export function normalizePhone(raw: string): PhoneCheck {
  const s = raw.trim().replace(/\(0\)/g, "");
  if (!s) return { ok: false, code: "EMPTY" };
  if (!/^[+\d\s().-]+$/.test(s)) return { ok: false, code: "INVALID" };
  let digits = s.replace(/\D/g, "");
  const international = s.startsWith("+") || digits.startsWith("00");
  if (!international) return { ok: false, code: "LOCAL_FORMAT" };
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) return { ok: false, code: "INVALID" };
  if (digits.length < 8 || digits.length > 15) return { ok: false, code: "LENGTH" };
  return { ok: true, digits, display: `+${digits}` };
}

export function whatsappLink(digits: string, text: string): string {
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const GREETING = "Bonjour, voici ma commande.";
const CLOSING =
  "Merci de confirmer la disponibilité, les prix définitifs et les frais supplémentaires.";

function trunc(s: string, n: number): string {
  const chars = Array.from(s);
  return chars.length > n ? `${chars.slice(0, n - 1).join("")}…` : s;
}

function articleBlock(index: number, lt: LineTotals, titleMax: number): string {
  const { line } = lt;
  const out: string[] = [];
  out.push(`ARTICLE ${index}`);
  out.push(`Produit : ${trunc(line.title, titleMax)}`);
  out.push(`Plateforme : ${line.platformLabel}`);
  out.push(`Lien : ${line.sourceUrl}`);
  out.push(`Quantité : ${line.quantity}`);

  const withOriginal = (name: string, value: string) => {
    const o = line.selectionOriginal[name];
    return o && o !== value ? `${value} (${o})` : value;
  };
  if (line.size) {
    const name = Object.keys(line.selection).find((k) => line.selection[k] === line.size) ?? "";
    out.push(`Taille : ${withOriginal(name, line.size)}`);
  }
  if (line.color) {
    const name = Object.keys(line.selection).find((k) => line.selection[k] === line.color) ?? "";
    out.push(`Couleur : ${withOriginal(name, line.color)}`);
  }
  for (const [name, value] of Object.entries(line.selection)) {
    if (value === line.size || value === line.color) continue;
    out.push(`${name} : ${withOriginal(name, value)}`);
  }

  const original = formatOriginal(line.unitPrice, line.currency);
  if (lt.unitCents !== null && lt.subtotalCents !== null) {
    const same = line.currency === "EUR";
    out.push(
      `Prix unitaire estimé : ${formatEurCents(lt.unitCents)}${same ? "" : ` (${original})`}`,
    );
    out.push(`Sous-total estimé : ${formatEurCents(lt.subtotalCents)}`);
  } else {
    out.push(`Prix unitaire (devise d’origine) : ${original} — conversion en euros indisponible`);
  }
  return out.join("\n");
}

function footer(totals: CartTotals): string {
  const out: string[] = [];
  if (totals.complete) {
    out.push(`TOTAL ESTIMÉ DES PRODUITS : ${formatEurCents(totals.productsCents)}`);
  } else {
    out.push(
      `TOTAL ESTIMÉ DES PRODUITS : indisponible (taux de change manquant : ${totals.missingCurrencies.join(", ")})`,
    );
  }
  out.push(`NOMBRE DE RÉFÉRENCES : ${totals.references}`);
  out.push(`NOMBRE TOTAL D’UNITÉS : ${totals.units}`);
  out.push("");
  out.push(CLOSING);
  return out.join("\n");
}

export type OrderMessage = {
  /** Message complet, en un seul bloc (pour « Copier »). */
  full: string;
  /** Découpage en parties compatibles avec la longueur d'URL de wa.me. */
  parts: string[];
};

/**
 * Construit le message de commande. Les messages longs sont découpés aux frontières
 * d'articles pour que chaque lien wa.me reste sous `maxEncodedLength` caractères
 * (les caractères chinois et accentués s'encodent sur 6 à 9 caractères d'URL).
 */
export function buildOrderMessage(
  totals: CartTotals,
  opts: { maxEncodedLength?: number } = {},
): OrderMessage {
  const max = opts.maxEncodedLength ?? 1800;
  const blocks = totals.lines.map((lt, i) => articleBlock(i + 1, lt, 120));
  const tail = footer(totals);
  const full = [GREETING, ...blocks, tail].join("\n\n");

  const enc = (s: string) => encodeURIComponent(s).length;
  if (enc(full) <= max) return { full, parts: [full] };

  // Découpage glouton ; le marqueur « (partie i/n) » est ajouté après coup (marge de 60 caractères réservée).
  const budget = max - 60;
  const chunks: string[][] = [[]];
  let size = enc(GREETING);
  for (let i = 0; i < blocks.length; i++) {
    let block = blocks[i] as string;
    if (enc(block) > budget) {
      block = articleBlock(i + 1, totals.lines[i] as LineTotals, 40);
    }
    const add = enc(`\n\n${block}`);
    const current = chunks[chunks.length - 1] as string[];
    if (current.length > 0 && size + add > budget) {
      chunks.push([block]);
      size = enc("Commande (suite)") + add;
    } else {
      current.push(block);
      size += add;
    }
  }
  // Le pied de message va dans la dernière partie, ou dans une partie à part s'il ne rentre pas.
  const last = chunks[chunks.length - 1] as string[];
  const tailAdd = enc(`\n\n${tail}`);
  const lastSize = enc(`\n\n${last.join("\n\n")}`);
  const tailFits = lastSize + tailAdd <= budget;
  const total = tailFits ? chunks.length : chunks.length + 1;

  const parts = chunks.map((blks, idx) => {
    const head =
      idx === 0
        ? `${GREETING} (partie 1/${total})`
        : `Commande (suite) (partie ${idx + 1}/${total})`;
    const body = [head, ...blks];
    if (tailFits && idx === chunks.length - 1) body.push(tail);
    return body.join("\n\n");
  });
  if (!tailFits) parts.push([`Commande (suite) (partie ${total}/${total})`, tail].join("\n\n"));
  return { full, parts };
}
