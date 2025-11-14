/**
 * Storage Factory
 * 
 * Creates the appropriate storage implementation based on environment.
 * - Replit: Uses in-memory storage (MemStorage)
 * - Local: Uses PostgreSQL storage (PostgresStorage)
 */

import { ENV_CONFIG, validateDatabaseAccess } from "@shared/environment";
import { MemStorage, type IStorage } from "./storage";

/**
 * Create and initialize storage instance based on environment
 * 
 * Priority order:
 * 1. If DATABASE_URL is accessible → PostgresStorage (regardless of environment)
 * 2. Otherwise → MemStorage
 * 
 * This allows using PostgresStorage even in Replit if DATABASE_URL is configured.
 */
async function createStorage(): Promise<IStorage> {
  let storage: IStorage;
  
  // Check if PostgreSQL is actually accessible (priority check)
  const dbAvailable = await validateDatabaseAccess();
  
  if (dbAvailable) {
    console.log("[Storage] Using PostgreSQL storage (DATABASE_URL accessible)");
    
    // Lazy import to avoid DATABASE_URL requirement when not available
    const { PostgresStorage } = await import("./pg-storage");
    storage = new PostgresStorage();
  } else {
    // Fall back to in-memory storage
    console.log(`[Storage] Using in-memory storage (PostgreSQL not accessible, env: ${ENV_CONFIG.env})`);
    storage = new MemStorage();
  }
  
  // Initialize storage (creates default workspace and files)
  await storage.initialize();
  console.log("[Storage] Initialization complete");
  
  return storage;
}

// Export storage promise that will be awaited in server startup
export const storagePromise = createStorage();

// For backward compatibility, export a getter that throws if not initialized
let storageInstance: IStorage | null = null;
storagePromise.then(s => { storageInstance = s; });

export const storage: IStorage = new Proxy({} as IStorage, {
  get(_target, prop) {
    if (!storageInstance) {
      throw new Error("Storage not initialized. Ensure storagePromise is awaited before use.");
    }
    return (storageInstance as any)[prop];
  }
});
