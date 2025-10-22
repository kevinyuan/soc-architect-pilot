/**
 * S3 Cache Service
 *
 * Provides high-performance caching layer for S3 component library and shared templates
 * Features:
 * - LRU cache with configurable size limits
 * - TTL-based expiration
 * - Cache statistics and monitoring
 * - Namespace support for different data types
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  hits: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

export class S3CacheService<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: string[] = []; // For LRU tracking
  private hits: number = 0;
  private misses: number = 0;

  constructor(
    private readonly namespace: string,
    private readonly ttlMs: number = 5 * 60 * 1000, // Default 5 minutes
    private readonly maxSize: number = 1000 // Max entries
  ) {
    console.log(`[S3Cache] Initialized ${namespace} cache: TTL=${ttlMs}ms, MaxSize=${maxSize}`);
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.misses++;
      return null;
    }

    // Update access tracking for LRU
    entry.hits++;
    this.hits++;
    this.updateAccessOrder(key);

    return entry.data;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T): void {
    const now = Date.now();

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data: value,
      timestamp: now,
      hits: 0
    });

    this.updateAccessOrder(key);
  }

  /**
   * Delete specific key from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.removeFromAccessOrder(key);
    }
    return deleted;
  }

  /**
   * Delete all keys matching a pattern
   */
  deletePattern(pattern: RegExp): number {
    let count = 0;
    const keys = Array.from(this.cache.keys());
    for (const key of keys) {
      if (pattern.test(key)) {
        this.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
    console.log(`[S3Cache] Cleared ${this.namespace} cache`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? this.hits / total : 0
    };
  }

  /**
   * Get all keys in cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder[0];
    this.cache.delete(lruKey);
    this.accessOrder.shift();

    console.log(`[S3Cache] Evicted LRU entry from ${this.namespace}: ${lruKey}`);
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Cleanup expired entries (can be called periodically)
   */
  cleanupExpired(): number {
    const now = Date.now();
    let count = 0;

    const entries = Array.from(this.cache.entries());
    for (const [key, entry] of entries) {
      if (now - entry.timestamp > this.ttlMs) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        count++;
      }
    }

    if (count > 0) {
      console.log(`[S3Cache] Cleaned up ${count} expired entries from ${this.namespace}`);
    }

    return count;
  }
}

/**
 * Cache Manager - Manages all cache instances
 */
export class S3CacheManager {
  private static instance: S3CacheManager;
  private caches: Map<string, S3CacheService<any>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    // Start periodic cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupAll();
    }, 5 * 60 * 1000);
  }

  static getInstance(): S3CacheManager {
    if (!S3CacheManager.instance) {
      S3CacheManager.instance = new S3CacheManager();
    }
    return S3CacheManager.instance;
  }

  /**
   * Get or create cache instance
   */
  getCache<T>(namespace: string, ttlMs?: number, maxSize?: number): S3CacheService<T> {
    if (!this.caches.has(namespace)) {
      this.caches.set(namespace, new S3CacheService<T>(namespace, ttlMs, maxSize));
    }
    return this.caches.get(namespace)!;
  }

  /**
   * Clear specific cache
   */
  clearCache(namespace: string): void {
    const cache = this.caches.get(namespace);
    if (cache) {
      cache.clear();
    }
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    const caches = Array.from(this.caches.values());
    for (const cache of caches) {
      cache.clear();
    }
  }

  /**
   * Cleanup expired entries in all caches
   */
  cleanupAll(): void {
    let totalCleaned = 0;
    const caches = Array.from(this.caches.values());
    for (const cache of caches) {
      totalCleaned += cache.cleanupExpired();
    }
    if (totalCleaned > 0) {
      console.log(`[S3CacheManager] Total cleaned: ${totalCleaned} entries`);
    }
  }

  /**
   * Get stats for all caches
   */
  getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};
    const entries = Array.from(this.caches.entries());
    for (const [namespace, cache] of entries) {
      stats[namespace] = cache.getStats();
    }
    return stats;
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clearAll();
  }
}

// Export singleton instance
export const cacheManager = S3CacheManager.getInstance();

// Predefined cache namespaces
export const CACHE_NAMESPACES = {
  COMPONENT_INDEX: 'component-index',
  COMPONENT_DATA: 'component-data',
  TEMPLATE_LIST: 'template-list',
  TEMPLATE_DATA: 'template-data',
} as const;
