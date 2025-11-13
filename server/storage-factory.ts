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
 */
async function createStorage(): Promise<IStorage> {
  let storage: IStorage;
  
  if (ENV_CONFIG.database.mode === "local") {
    // Check if PostgreSQL is actually accessible
    const dbAvailable = await validateDatabaseAccess();
    
    if (dbAvailable) {
      console.log("[Storage] Using PostgreSQL storage (local mode)");
      
      // Lazy import to avoid DATABASE_URL requirement in Replit mode
      const { PostgresStorage } = await import("./pg-storage");
      storage = new PostgresStorage();
    } else {
      console.log("[Storage] PostgreSQL not accessible, falling back to in-memory");
      storage = new MemStorage();
    }
  } else {
    // Replit mode - use in-memory storage
    console.log("[Storage] Using in-memory storage (Replit mode)");
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
