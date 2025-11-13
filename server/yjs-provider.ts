import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import { WebSocket, WebSocketServer } from "ws";
import { Server as HttpServer } from "http";
import type { IStorage } from "./storage";

/**
 * Yjs WebSocket Provider for Real-Time Collaborative Editing (Phase 7)
 * 
 * This implements a Yjs server-side provider that:
 * - Manages Y.Doc instances per workspace/file
 * - Synchronizes document updates across connected clients
 * - Persists document state to PostgreSQL
 * - Handles user awareness (cursors, selections, presence)
 */

interface YjsConnection {
  ws: WebSocket;
  workspaceId: string;
  userId: string;
  username: string;
  docName: string;
}

interface WSSharedDoc {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  connections: Set<YjsConnection>;
}

export class YjsProvider {
  private storage: IStorage;
  private docs: Map<string, WSSharedDoc> = new Map();
  private wss: WebSocketServer | null = null;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Initialize Yjs WebSocket server
   */
  initialize(httpServer: HttpServer) {
    this.wss = new WebSocketServer({ 
      server: httpServer, 
      path: "/yjs" 
    });

    this.wss.on("connection", (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    console.log("[YjsProvider] WebSocket server initialized on /yjs");
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: any) {
    const url = new URL(req.url, "http://localhost");
    const workspaceId = url.searchParams.get("workspaceId");
    const userId = url.searchParams.get("userId");
    const username = url.searchParams.get("username");
    const docName = url.searchParams.get("docName"); // file path

    if (!workspaceId || !userId || !username || !docName) {
      ws.close(1008, "Missing required parameters");
      return;
    }

    const docKey = `${workspaceId}:${docName}`;
    const sharedDoc = this.getOrCreateDoc(docKey, workspaceId, docName);

    const connection: YjsConnection = {
      ws,
      workspaceId,
      userId,
      username,
      docName,
    };

    sharedDoc.connections.add(connection);

    // Send initial document state to new client
    this.sendInitialState(ws, sharedDoc);

    // Handle incoming messages
    ws.on("message", (message: Buffer) => {
      this.handleMessage(message, connection, sharedDoc);
    });

    // Handle disconnection
    ws.on("close", () => {
      this.handleDisconnect(connection, sharedDoc, docKey);
    });

    console.log(`[YjsProvider] Client connected: ${username} (${userId}) to ${docName} in ${workspaceId}`);
  }

  /**
   * Get or create a shared document
   */
  private getOrCreateDoc(docKey: string, workspaceId: string, docName: string): WSSharedDoc {
    let sharedDoc = this.docs.get(docKey);

    if (!sharedDoc) {
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);

      sharedDoc = {
        doc,
        awareness,
        connections: new Set(),
      };

      this.docs.set(docKey, sharedDoc);

      // Load persisted state from database
      this.loadDocumentState(workspaceId, docName, doc);

      // Auto-save on updates (debounced)
      let saveTimeout: NodeJS.Timeout | null = null;
      doc.on("update", () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
          this.saveDocumentState(workspaceId, docName, doc);
        }, 2000); // Debounce 2 seconds
      });
    }

    return sharedDoc;
  }

  /**
   * Send initial document state to client
   */
  private sendInitialState(ws: WebSocket, sharedDoc: WSSharedDoc) {
    const { doc, awareness } = sharedDoc;

    // Send Y.Doc state
    const stateVector = Y.encodeStateVector(doc);
    const update = Y.encodeStateAsUpdate(doc, stateVector);
    
    // Message format: [messageType: number, ...data]
    // Type 0: Sync Step 1 (state vector)
    // Type 1: Sync Step 2 (update)
    // Type 2: Update
    const syncMessage = new Uint8Array([0, ...Array.from(update)]);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(syncMessage);
    }

    // Send awareness state
    const awarenessUpdate = awarenessProtocol.encodeAwarenessUpdate(
      awareness,
      Array.from(awareness.getStates().keys())
    );
    const awarenessMessage = new Uint8Array([1, ...Array.from(awarenessUpdate)]);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(awarenessMessage);
    }
  }

  /**
   * Handle incoming messages from client
   */
  private handleMessage(message: Buffer, connection: YjsConnection, sharedDoc: WSSharedDoc) {
    const data = new Uint8Array(message);
    const messageType = data[0];
    const payload = data.slice(1);

    switch (messageType) {
      case 0: // Sync Step 1 (client sends state vector)
        this.handleSyncStep1(payload, connection.ws, sharedDoc);
        break;
      case 1: // Awareness update
        this.handleAwarenessUpdate(payload, connection, sharedDoc);
        break;
      case 2: // Document update
        this.handleDocumentUpdate(payload, connection, sharedDoc);
        break;
      default:
        console.warn(`[YjsProvider] Unknown message type: ${messageType}`);
    }
  }

  /**
   * Handle Sync Step 1: Client sends state vector, server responds with update
   */
  private handleSyncStep1(stateVector: Uint8Array, ws: WebSocket, sharedDoc: WSSharedDoc) {
    const update = Y.encodeStateAsUpdate(sharedDoc.doc, stateVector);
    const syncMessage = new Uint8Array([0, ...Array.from(update)]);
    
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(syncMessage);
    }
  }

  /**
   * Handle awareness update (cursor positions, selections, presence)
   */
  private handleAwarenessUpdate(update: Uint8Array, connection: YjsConnection, sharedDoc: WSSharedDoc) {
    // Apply update to local awareness
    awarenessProtocol.applyAwarenessUpdate(sharedDoc.awareness, update, connection);

    // Broadcast to all other clients
    const awarenessMessage = new Uint8Array([1, ...Array.from(update)]);
    this.broadcastToOthers(awarenessMessage, connection, sharedDoc);
  }

  /**
   * Handle document update
   */
  private handleDocumentUpdate(update: Uint8Array, connection: YjsConnection, sharedDoc: WSSharedDoc) {
    // Apply update to Y.Doc
    Y.applyUpdate(sharedDoc.doc, update);

    // Broadcast to all other clients
    const updateMessage = new Uint8Array([2, ...Array.from(update)]);
    this.broadcastToOthers(updateMessage, connection, sharedDoc);
  }

  /**
   * Broadcast message to all clients except sender
   */
  private broadcastToOthers(message: Uint8Array, sender: YjsConnection, sharedDoc: WSSharedDoc) {
    sharedDoc.connections.forEach((conn) => {
      if (conn !== sender && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(message);
      }
    });
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(connection: YjsConnection, sharedDoc: WSSharedDoc, docKey: string) {
    sharedDoc.connections.delete(connection);

    // Remove from awareness
    sharedDoc.awareness.setLocalState(null);

    // If no more connections, save and cleanup after delay
    if (sharedDoc.connections.size === 0) {
      setTimeout(() => {
        if (sharedDoc.connections.size === 0) {
          this.saveDocumentState(connection.workspaceId, connection.docName, sharedDoc.doc);
          this.docs.delete(docKey);
          sharedDoc.doc.destroy();
          console.log(`[YjsProvider] Cleaned up doc: ${docKey}`);
        }
      }, 30000); // Wait 30 seconds before cleanup
    }

    console.log(`[YjsProvider] Client disconnected: ${connection.username} from ${connection.docName}`);
  }

  /**
   * Load document state from database
   */
  private async loadDocumentState(workspaceId: string, docName: string, doc: Y.Doc) {
    try {
      // For now, skip database loading in Replit mode (MemStorage doesn't support Yjs)
      // In local PostgreSQL mode, we'll load from yjs_documents table
      console.log(`[YjsProvider] Loading doc state for ${docName} in ${workspaceId} (skipped in memory mode)`);
      
      // TODO: Implement when PostgresStorage is active:
      // const yjsDoc = await this.storage.getYjsDocument(workspaceId, docName);
      // if (yjsDoc?.state) {
      //   const stateBuffer = Buffer.from(yjsDoc.state, 'base64');
      //   Y.applyUpdate(doc, new Uint8Array(stateBuffer));
      // }
    } catch (error) {
      console.error(`[YjsProvider] Failed to load doc state:`, error);
    }
  }

  /**
   * Save document state to database
   */
  private async saveDocumentState(workspaceId: string, docName: string, doc: Y.Doc) {
    try {
      const state = Y.encodeStateAsUpdate(doc);
      const stateBase64 = Buffer.from(state).toString('base64');
      const stateVector = Y.encodeStateVector(doc);
      const stateVectorBase64 = Buffer.from(stateVector).toString('base64');

      console.log(`[YjsProvider] Saving doc state for ${docName} in ${workspaceId} (skipped in memory mode)`);

      // TODO: Implement when PostgresStorage is active:
      // await this.storage.saveYjsDocument({
      //   workspaceId,
      //   docName,
      //   state: stateBase64,
      //   stateVector: stateVectorBase64,
      // });
    } catch (error) {
      console.error(`[YjsProvider] Failed to save doc state:`, error);
    }
  }

  /**
   * Get active connections for a workspace
   */
  getActiveConnections(workspaceId: string): YjsConnection[] {
    const connections: YjsConnection[] = [];
    
    this.docs.forEach((sharedDoc) => {
      sharedDoc.connections.forEach((conn) => {
        if (conn.workspaceId === workspaceId) {
          connections.push(conn);
        }
      });
    });

    return connections;
  }

  /**
   * Cleanup all resources
   */
  async shutdown() {
    console.log("[YjsProvider] Shutting down...");

    // Save all documents
    const savePromises: Promise<void>[] = [];
    this.docs.forEach((sharedDoc, docKey) => {
      const [workspaceId, docName] = docKey.split(":");
      savePromises.push(this.saveDocumentState(workspaceId, docName, sharedDoc.doc));
      sharedDoc.doc.destroy();
    });

    await Promise.all(savePromises);

    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }

    this.docs.clear();
    console.log("[YjsProvider] Shutdown complete");
  }
}

// Singleton instance
let yjsProviderInstance: YjsProvider | null = null;

export function initializeYjsProvider(httpServer: HttpServer, storage: IStorage): YjsProvider {
  if (!yjsProviderInstance) {
    yjsProviderInstance = new YjsProvider(storage);
    yjsProviderInstance.initialize(httpServer);
  }
  return yjsProviderInstance;
}

export function getYjsProvider(): YjsProvider | null {
  return yjsProviderInstance;
}
