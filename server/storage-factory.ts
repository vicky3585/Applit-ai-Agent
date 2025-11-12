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
 * Create storage instance based on environment
 */
export function createStorage(): IStorage {
  if (ENV_CONFIG.database.mode === "replit") {
    console.log("[Storage] Using in-memory storage (Replit mode)");
    return new MemStorage();
  }
  
  // For local mode with PostgreSQL
  // TODO: Implement PostgreSQL storage when deployed locally
  console.log("[Storage] PostgreSQL not yet implemented, falling back to in-memory");
  return new MemStorage();
}

export const storage = createStorage();
