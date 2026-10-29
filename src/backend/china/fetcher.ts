import { checkParsedUrl } from "../../lib/china/url.ts";
import { ImportError } from "./errors.ts";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type SafeFetchResult = { html: string; finalUrl: URL; status: number };

export type SafeFetchOptions = {
  fetchImpl?: FetchLike;
  maxRedirects?: number;
  maxBytes?: number;
  timeoutMs?: number;
};

const DEFAULT_MAX_BYTES = 2_000_000;
const DEFAULT_TIMEOUT = 10_000;

// User-Agent honnête : on ne se fait pas passer pour un navigateur.
const USER_AGENT = "ResellFlowImporter/1.0 (user-requested product page import)";

function charsetOf(contentType: string): string | null {
  const m = contentType.match(/charset\s*=\s*["']?([\w-]+)/i);
  return m?.[1]?.toLowerCase() ?? null;
}

function decode(bytes: Uint8Array, contentType: string): string {
  let charset = charsetOf(contentType);
  if (!charset) {
    // <meta charset=…> dans les 2 premiers ko (lecture en latin1, neutre pour l'ASCII)
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
    charset = head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1]?.toLowerCase() ?? "utf-8";
  }
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    await res.body?.cancel().catch(() => undefined);
    throw new ImportError("TOO_LARGE", "La page est trop volumineuse pour être analysée.");
  }
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes)
      throw new ImportError("TOO_LARGE", "La page est trop volumineuse pour être analysée.");
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ImportError("TOO_LARGE", "La page est trop volumineuse pour être analysée.");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

/**
 * Télécharge une page HTML en suivant les redirections À LA MAIN : chaque saut est
 * revalidé contre la liste blanche de domaines (protection SSRF). Une redirection vers
 * un hôte interne (169.254.169.254, localhost, IP privée…) ou non autorisé est refusée.
 * Aucune tentative de contournement de CAPTCHA / connexion : un blocage est remonté tel quel.
 */
export async function safeFetchHtml(
  start: URL,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const maxRedirects = opts.maxRedirects ?? 4;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const deadline = Date.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT);

  let current = start;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = checkParsedUrl(current);
    if (!check.ok) {
      throw new ImportError(
        check.code === "UNSUPPORTED_PLATFORM" ? "UNSUPPORTED_PLATFORM" : "INVALID_URL",
        hop === 0
          ? "Ce lien n’est pas pris en charge."
          : "Le lien redirige vers un site non autorisé : import refusé par sécurité.",
      );
    }
    current = check.url;

    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new ImportError("TIMEOUT", "La plateforme met trop de temps à répondre.");

    let res: Response;
    try {
      res = await fetchImpl(current.href, {
        method: "GET",
        redirect: "manual",
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-language": "zh-CN,zh;q=0.9,fr;q=0.8,en;q=0.7",
        },
        signal: AbortSignal.timeout(remaining),
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new ImportError("TIMEOUT", "La plateforme met trop de temps à répondre.");
      }
      const cause = (e as { cause?: { code?: string; message?: string } } | null)?.cause;
      const code = cause?.code ?? (e instanceof Error ? e.message : "inconnue");
      console.error("[china/fetch]", current.hostname, code, cause?.message ?? "");
      throw new ImportError(
        "NETWORK",
        `Impossible de joindre ${current.hostname} depuis le serveur (cause : ${String(code).slice(0, 60)}). Vérifie la connexion / VPN / pare-feu de la machine qui exécute le site, ou utilise l’import depuis ta page ouverte.`,
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!loc) throw new ImportError("HTTP_ERROR", `Redirection invalide (HTTP ${res.status}).`);
      try {
        current = new URL(loc, current);
      } catch {
        throw new ImportError("INVALID_URL", "Redirection vers une adresse invalide.");
      }
      continue;
    }

    if (res.status === 401 || res.status === 403 || res.status === 429 || res.status === 451) {
      await res.body?.cancel().catch(() => undefined);
      throw new ImportError(
        "BLOCKED",
        "La plateforme refuse l’accès automatique à cette page (connexion, vérification anti-robot ou limite de requêtes).",
      );
    }
    if (res.status < 200 || res.status >= 300) {
      await res.body?.cancel().catch(() => undefined);
      throw new ImportError(
        "HTTP_ERROR",
        res.status === 404 || res.status === 410
          ? "Produit introuvable : le lien est peut-être périmé."
          : `La plateforme a répondu avec une erreur (HTTP ${res.status}).`,
      );
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      await res.body?.cancel().catch(() => undefined);
      throw new ImportError("BAD_CONTENT", "La réponse n’est pas une page web exploitable.");
    }
    let bytes: Uint8Array;
    try {
      bytes = await readCapped(res, maxBytes);
    } catch (e) {
      if (e instanceof ImportError) throw e;
      const name = e instanceof Error ? e.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new ImportError("TIMEOUT", "La plateforme met trop de temps à répondre.");
      }
      throw new ImportError(
        "NETWORK",
        "Connexion interrompue pendant le téléchargement de la page.",
      );
    }
    return { html: decode(bytes, contentType), finalUrl: current, status: res.status };
  }
  throw new ImportError("TOO_MANY_REDIRECTS", "Trop de redirections : lien non exploitable.");
}
