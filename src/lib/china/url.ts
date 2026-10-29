import {
  isAllowedHost,
  platformForHost,
  shortLinkPlatformForHost,
  type PlatformDef,
} from "./platforms.ts";

export type UrlCheck =
  | {
      ok: true;
      url: URL;
      platform: PlatformDef;
      /** true si c'est un lien court (redirection à suivre côté serveur). */
      isShort: boolean;
      itemId: string | null;
    }
  | { ok: false; code: "EMPTY_INPUT" | "INVALID_URL" | "UNSUPPORTED_PLATFORM"; host?: string };

export const MAX_URL_LENGTH = 2048;

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`，。！？、）)】\]]+/i;
const BARE_DOMAIN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#]\S*)?$/i;

/** Retire la ponctuation finale collée à un lien dans un texte de partage. */
function trimTrailingPunctuation(s: string): string {
  return s.replace(/[.,;:!?]+$/, "");
}

/**
 * Extrait un lien depuis ce que l'utilisateur a collé. Les applications chinoises
 * collent un texte de partage complet (« 【淘宝】https://e.tb.cn/h.xxx 点击链接… »).
 */
export function extractUrlCandidate(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const m = text.match(URL_IN_TEXT);
  if (m) return trimTrailingPunctuation(m[0]);
  const firstToken = text.split(/\s+/)[0] ?? "";
  if (BARE_DOMAIN.test(firstToken)) return `https://${trimTrailingPunctuation(firstToken)}`;
  return null;
}

function isIpLiteral(host: string): boolean {
  if (host.includes(":") || host.startsWith("[")) return true; // IPv6
  if (/^\d+$/.test(host)) return true; // forme entière (2130706433)
  if (/^(?:0x[0-9a-f]+|\d+)(?:\.(?:0x[0-9a-f]+|\d+)){1,3}$/i.test(host)) return true; // IPv4 (y compris hex/octal)
  return false;
}

/**
 * Valide un lien saisi par l'utilisateur ou rencontré dans une redirection.
 * Sert côté client (retour immédiat) ET côté serveur (validation d'autorité).
 */
export function checkImportUrl(raw: string): UrlCheck {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, code: "EMPTY_INPUT" };
  const candidate = extractUrlCandidate(raw);
  if (!candidate || candidate.length > MAX_URL_LENGTH) return { ok: false, code: "INVALID_URL" };

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, code: "INVALID_URL" };
  }
  return checkParsedUrl(url);
}

export function checkParsedUrl(input: URL): UrlCheck {
  const url = new URL(input.href);
  if (url.protocol !== "https:" && url.protocol !== "http:")
    return { ok: false, code: "INVALID_URL" };
  if (url.username || url.password) return { ok: false, code: "INVALID_URL" };
  if (url.port && url.port !== "80" && url.port !== "443")
    return { ok: false, code: "INVALID_URL" };

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || !host.includes(".") || isIpLiteral(host)) {
    return { ok: false, code: "INVALID_URL" };
  }
  if (!isAllowedHost(host)) return { ok: false, code: "UNSUPPORTED_PLATFORM", host };

  // On ne parle jamais en clair aux plateformes.
  url.protocol = "https:";
  url.port = "";
  url.hash = "";

  // Les liens courts d'abord : a.aliexpress.com est aussi un sous-domaine d'aliexpress.com.
  const short = shortLinkPlatformForHost(host);
  if (short) return { ok: true, url, platform: short, isShort: true, itemId: null };
  const direct = platformForHost(host);
  if (direct) {
    return { ok: true, url, platform: direct, isShort: false, itemId: direct.extractItemId(url) };
  }
  return { ok: false, code: "UNSUPPORTED_PLATFORM", host };
}
