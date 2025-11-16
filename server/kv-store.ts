/**
 * Key-Value Store abstraction (Week 1 Priority #3)
 * 
 * Provides Redis-like KV operations with automatic fallback:
 * - Production (Ubuntu): Uses Redis via ioredis
 * - Development (Replit): Uses in-memory Map
 */

import Redis from "ioredis";

export interface IKVStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, expirySeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  keys(pattern: string): Promise<string[]>;
  expire(key: string, seconds: number): Promise<void>;
  ttl(key: string): Promise<number>; // Returns -1 if no expiry, -2 if not found
}

/**
 * Redis-based KV store (for production)
 */
class RedisKVStore implements IKVStore {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error("[RedisKV] Max retries reached, giving up");
          return null; // Stop retrying
        }
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on("connect", () => {
      console.log("[RedisKV] Connected to Redis");
    });

    this.redis.on("error", (err) => {
      console.error("[RedisKV] Redis error:", err.message);
    });
  }

  async get(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }

  async set(key: string, value: string, expirySeconds?: number): Promise<void> {
    if (expirySeconds) {
      await this.redis.setex(key, expirySeconds, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.redis.keys(pattern);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.redis.expire(key, seconds);
  }

  async ttl(key: string): Promise<number> {
    return await this.redis.ttl(key);
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * In-memory KV store (for development/Replit)
 */
class MemoryKVStore implements IKVStore {
  private store: Map<string, { value: string; expiry?: number }>;
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    this.store = new Map();
    
    // Cleanup expired keys every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
    
    console.log("[MemoryKV] In-memory KV store initialized");
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, data] of Array.from(this.store.entries())) {
      if (data.expiry && data.expiry < now) {
        this.store.delete(key);
      }
    }
  }

  async get(key: string): Promise<string | null> {
    const data = this.store.get(key);
    if (!data) return null;
    
    // Check expiry
    if (data.expiry && data.expiry < Date.now()) {
      this.store.delete(key);
      return null;
    }
    
    return data.value;
  }

  async set(key: string, value: string, expirySeconds?: number): Promise<void> {
    const expiry = expirySeconds ? Date.now() + (expirySeconds * 1000) : undefined;
    this.store.set(key, { value, expiry });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.get(key); // Uses expiry check
    return value !== null;
  }

  async keys(pattern: string): Promise<string[]> {
    // Simple glob pattern matching (* and ?)
    const regex = new RegExp(
      '^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$'
    );
    
    const matchingKeys: string[] = [];
    for (const key of Array.from(this.store.keys())) {
      if (regex.test(key)) {
        // Only include non-expired keys
        const value = await this.get(key);
        if (value !== null) {
          matchingKeys.push(key);
        }
      }
    }
    
    return matchingKeys;
  }

  async expire(key: string, seconds: number): Promise<void> {
    const data = this.store.get(key);
    if (data) {
      data.expiry = Date.now() + (seconds * 1000);
      this.store.set(key, data);
    }
  }

  async ttl(key: string): Promise<number> {
    const data = this.store.get(key);
    if (!data) return -2; // Key does not exist
    if (!data.expiry) return -1; // No expiry set
    
    const remaining = Math.floor((data.expiry - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2; // Return -2 if expired
  }

  disconnect(): void {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

/**
 * Create KV store based on environment
 */
async function createKVStore(): Promise<IKVStore> {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    try {
      console.log("[KVStore] Attempting to connect to Redis...");
      const redis = new RedisKVStore(redisUrl);
      
      // Test connection
      await redis.set("__health__", "ok", 5);
      const health = await redis.get("__health__");
      
      if (health === "ok") {
        console.log("[KVStore] Redis connection successful");
        return redis;
      }
    } catch (error) {
      console.warn("[KVStore] Redis connection failed, falling back to in-memory:", error);
    }
  }
  
  console.log("[KVStore] Using in-memory KV store");
  return new MemoryKVStore();
}

// Export singleton instance
export const kvStorePromise = createKVStore();
