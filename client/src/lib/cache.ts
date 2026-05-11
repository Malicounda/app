// Simple localStorage cache with TTL
// Keys are namespaced and values serialized as JSON with { expiresAt, value }

export type CacheOptions = {
  ttlMs?: number; // time to live in milliseconds
  namespace?: string; // optional namespace prefix
};

const defaultNamespace = 'mapCache';

function nsKey(key: string, ns?: string) {
  return `${ns || defaultNamespace}:${key}`;
}

export function setCache<T>(key: string, value: T, opts?: CacheOptions) {
  try {
    const ttl = opts?.ttlMs ?? 5 * 60 * 1000; // default 5 minutes
    const item = {
      expiresAt: Date.now() + ttl,
      value,
    };
    localStorage.setItem(nsKey(key, opts?.namespace), JSON.stringify(item));
  } catch {}
}

export function getCache<T>(key: string, opts?: CacheOptions): T | null {
  try {
    const raw = localStorage.getItem(nsKey(key, opts?.namespace));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.expiresAt !== 'number') return null;
    if (Date.now() > parsed.expiresAt) {
      // expired
      localStorage.removeItem(nsKey(key, opts?.namespace));
      return null;
    }
    return parsed.value as T;
  } catch {
    return null;
  }
}

export function removeCache(key: string, opts?: CacheOptions) {
  try { localStorage.removeItem(nsKey(key, opts?.namespace)); } catch {}
}

export function setBool(key: string, v: boolean, opts?: CacheOptions) {
  try { localStorage.setItem(nsKey(key, opts?.namespace), v ? '1' : '0'); } catch {}
}

export function getBool(key: string, def = false, opts?: CacheOptions) {
  try {
    const val = localStorage.getItem(nsKey(key, opts?.namespace));
    if (val === '1') return true;
    if (val === '0') return false;
    return def;
  } catch { return def; }
}
