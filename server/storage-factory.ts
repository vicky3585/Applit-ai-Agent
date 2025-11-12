/**
 * Storage Factory
 * 
 * Creates the appropriate storage implementation based on environment.
 * - Replit: Uses in-memory storage (MemStorage)
 * - Local: Uses PostgreSQL storage (to be implemented)
 */

import { ENV_CONFIG } from "@shared/environment";
import { MemStorage, type IStorage } from "./storage";

/**
 * Create and initialize storage instance based on environment
 */
async function createStorage(): Promise<IStorage> {
  const storage = new MemStorage();
  
  if (ENV_CONFIG.database.mode === "replit") {
    console.log("[Storage] Using in-memory storage (Replit mode)");
  } else {
    // For local mode with PostgreSQL
    // TODO: Implement PostgreSQL storage when deployed locally
    console.log("[Storage] PostgreSQL not yet implemented, falling back to in-memory");
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
