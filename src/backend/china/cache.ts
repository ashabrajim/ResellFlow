// Utilitaires en mémoire (par instance serveur). Sur Cloudflare Workers, chaque isolat
// a sa propre mémoire : c'est un cache « au mieux ». Pour un cache/limiteur partagé en
// production, voir la section « Déploiement » du README (KV / Rate Limiting binding).

export type Clock = () => number;

export type TtlCache<V> = {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): void;
  size(): number;
};

export function createTtlCache<V>(opts: { ttlMs: number; max: number; now?: Clock }): TtlCache<V> {
  const now = opts.now ?? Date.now;
  const map = new Map<string, { value: V; expiresAt: number }>();
  return {
    get(key) {
      const e = map.get(key);
      if (!e) return undefined;
      if (e.expiresAt <= now()) {
        map.delete(key);
        return undefined;
      }
      return e.value;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, { value, expiresAt: now() + opts.ttlMs });
      while (map.size > opts.max) {
        const oldest = map.keys().next().value;
        if (oldest === undefined) break;
        map.delete(oldest);
      }
    },
    delete(key) {
      map.delete(key);
    },
    size: () => map.size,
  };
}

export type RateLimiter = {
  /** Renvoie true si la requête est autorisée (et la compte). */
  take(key: string): boolean;
};

/** Fenêtre glissante : au plus `limit` appels par `windowMs` et par clé. */
export function createRateLimiter(opts: {
  limit: number;
  windowMs: number;
  now?: Clock;
  maxKeys?: number;
}): RateLimiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();
  const maxKeys = opts.maxKeys ?? 5000;
  return {
    take(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((x) => t - x < opts.windowMs);
      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.delete(key);
      hits.set(key, recent);
      while (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
      }
      return true;
    },
  };
}
