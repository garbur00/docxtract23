// ─── In-memory cache with TTL ───────────────────────────────────────────────
// Stores recent document extraction results so frontend can re-fetch by ID.
// Auto-evicts old entries. Replace with Redis/Postgres for production scale.

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES = 100;

class DocumentCache {
  constructor() {
    this.store = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    // Don't keep process alive just for cleanup
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  set(id, value, ttlMs = DEFAULT_TTL_MS) {
    // Evict oldest if at capacity
    if (this.store.size >= MAX_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    this.store.set(id, {
      value,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    });
  }

  get(id) {
    const entry = this.store.get(id);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(id);
      return null;
    }
    return entry.value;
  }

  has(id) {
    return this.get(id) !== null;
  }

  delete(id) {
    return this.store.delete(id);
  }

  cleanup() {
    const now = Date.now();
    for (const [id, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(id);
      }
    }
  }

  stats() {
    return {
      size: this.store.size,
      max: MAX_ENTRIES,
      ttl_ms: DEFAULT_TTL_MS,
    };
  }
}

// Singleton — one cache per process
export const documentCache = new DocumentCache();
