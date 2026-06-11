
// frontend/src/services/api.js
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach JWT token automatically to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

// ── Indicator cache ────────────────────────────────────────────────────────
// Key: "exchange:symbol:interval" → { data, fetchedAt }
const indicatorCache = new Map();
const CACHE_TTL_MS   = 30_000; // 30 s — stale after a new candle arrives anyway

/**
 * Fetch all indicator arrays from the backend for a given symbol + interval.
 * Results are cached for 30 s so rapid re-renders don't hammer the server.
 *
 * @returns {Promise<object>} indicators object with array-per-indicator
 */
export async function fetchIndicators(exchange, symbol, interval) {
  const cacheKey = `${exchange}:${symbol}:${interval}`;
  const cached   = indicatorCache.get(cacheKey);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  const { data } = await api.get(`/indicators/${exchange}/${symbol}/${interval}`);
  if (!data?.success || !data.indicators) throw new Error('Bad indicator response');

  indicatorCache.set(cacheKey, { data: data.indicators, fetchedAt: Date.now() });
  return data.indicators;
}

/** Invalidate indicator cache for a symbol/interval (call after new candle) */
export function invalidateIndicatorCache(exchange, symbol, interval) {
  indicatorCache.delete(`${exchange}:${symbol}:${interval}`);
}
