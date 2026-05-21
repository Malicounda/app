/** Durée de session cookie + JWT (ms). Surcharge via SESSION_MAX_AGE_MS dans .env */
const DEFAULT_SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

export function getSessionMaxAgeMs(): number {
  const raw = process.env.SESSION_MAX_AGE_MS;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_SESSION_MS;
}

/** Durée pour jwt.sign expiresIn (secondes) */
export function getJwtExpiresInSeconds(): number {
  return Math.floor(getSessionMaxAgeMs() / 1000);
}
