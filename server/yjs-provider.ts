import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import { WebSocket, WebSocketServer } from "ws";
import { Server as HttpServer } from "http";
import type { IStorage } from "./storage";
import { encoding, decoding } from "lib0";

/**
 * Yjs WebSocket Provider for Real-Time Collaborative Editing (Phase 7)
 * 
 * Canonical y-websocket implementation for multiplayer editing.
 * Based on: https://github.com/yjs/y-websocket
 */

interface WSSharedDoc {
  name: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
}

const docs: Map<string, WSSharedDoc> = new Map();
const messageSync = 0;
const messageAwareness = 1;

export class YjsProvider {
  private storage: IStorage;
  private wss: WebSocketServer | null = null;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  /**
   * Initialize Yjs WebSocket server with canonical y-websocket protocol
   */
  initialize(httpServer: HttpServer) {
    this.wss = new WebSocketServer({ 
      server: httpServer, 
      path: "/yjs" 
    });

    this.wss.on("connection", (conn: WebSocket, req) => {
      this.setupWSConnection(conn, req);
    });

    console.log("[YjsProvider] WebSocket server initialized on /yjs");
  }

  /**
   * Setup WebSocket connection using canonical y-websocket protocol
   */
  private setupWSConnection(conn: WebSocket, req: any) {
    conn.binaryType = "arraybuffer";

    // Parse query parameters
    const url = new URL(req.url, "http://localhost");
    const docName = url.searchParams.get("docName") || "default";
    const workspaceId = url.searchParams.get("workspaceId") || "default";
    const userId = url.searchParams.get("userId") || "anonymous";
    const username = url.searchParams.get("username") || "Anonymous";

    const fullDocName = `${workspaceId}:${docName}`;

    // Get or create shared document
    const doc = getYDoc(fullDocName);
    doc.conns.set(conn, new Set());

    // CRITICAL: Broadcast document updates to ALL connected clients
    const updateHandler = (update: Uint8Array, origin: any) => {
      if (origin !== conn) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.writeUpdate(encoder, update);
        send(doc, conn, encoding.toUint8Array(encoder));
      }
    };
    doc.doc.on("update", updateHandler);

    // CRITICAL: Broadcast awareness updates to ALL connected clients
    const awarenessChangeHandler = (
      { added, updated, removed }: any,
      _origin: any
    ) => {
      const changedClients = added.concat(updated).concat(removed);
      
      // Broadcast to ALL connections
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(doc.awareness, changedClients)
      );
      const message = encoding.toUint8Array(encoder);

      // Send to all connected clients
      doc.conns.forEach((_, c) => {
        send(doc, c, message);
      });
    };
    doc.awareness.on("update", awarenessChangeHandler);

    // Send initial sync
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, doc.doc);
    send(doc, conn, encoding.toUint8Array(encoder));

    // Send awareness state
    const awarenessStates = doc.awareness.getStates();
    if (awarenessStates.size > 0) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(
          doc.awareness,
          Array.from(awarenessStates.keys())
        )
      );
      send(doc, conn, encoding.toUint8Array(encoder));
    }

    // Handle incoming messages
    conn.on("message", (message: ArrayBuffer) =>
      this.messageHandler(conn, doc, new Uint8Array(message))
    );

    // Handle disconnection
    conn.on("close", () => {
      const controlledIds = doc.conns.get(conn);
      doc.conns.delete(conn);
      doc.doc.off("update", updateHandler);
      doc.awareness.off("update", awarenessChangeHandler);
      
      if (controlledIds !== undefined && controlledIds.size > 0) {
        awarenessProtocol.removeAwarenessStates(
          doc.awareness,
          Array.from(controlledIds),
          null
        );
      }

      // Cleanup if no more connections
      if (doc.conns.size === 0) {
        setTimeout(() => {
          if (doc.conns.size === 0) {
            this.persistDoc(workspaceId, docName, doc.doc);
            docs.delete(fullDocName);
            doc.doc.destroy();
            console.log(`[YjsProvider] Cleaned up doc: ${fullDocName}`);
          }
        }, 30000); // 30 second grace period
      }

      console.log(`[YjsProvider] Client disconnected from ${docName}`);
    });

    console.log(`[YjsProvider] Client connected: ${username} to ${docName} in ${workspaceId}`);
  }

  /**
   * Handle incoming messages using canonical y-websocket protocol
   */
  private messageHandler(conn: WebSocket, doc: WSSharedDoc, message: Uint8Array) {
    try {
      const encoder = encoding.createEncoder();
      const decoder = decoding.createDecoder(message);
      const messageType = decoding.readVarUint(decoder);

      switch (messageType) {
        case messageSync:
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.readSyncMessage(decoder, encoder, doc.doc, conn);
          if (encoding.length(encoder) > 1) {
            send(doc, conn, encoding.toUint8Array(encoder));
          }
          break;
        case messageAwareness: {
          const awarenessUpdate = decoding.readVarUint8Array(decoder);
          awarenessProtocol.applyAwarenessUpdate(doc.awareness, awarenessUpdate, conn);
          
          // Track which awareness client IDs this connection controls
          const controlledIDs = doc.conns.get(conn);
          if (controlledIDs !== undefined) {
            // Decode awareness update to get client IDs
            const decoder2 = decoding.createDecoder(awarenessUpdate);
            const len = decoding.readVarUint(decoder2);
            for (let i = 0; i < len; i++) {
              const clientID = decoding.readVarUint(decoder2);
              controlledIDs.add(clientID);
              // Skip the clock and state data
              decoding.readVarUint(decoder2); // clock
              decoding.readVarString(decoder2); // state
            }
          }
          break;
        }
      }
    } catch (err) {
      console.error("[YjsProvider] Message handler error:", err);
    }
  }

  /**
   * Persist document to database (placeholder - TODO: implement with PostgresStorage)
   */
  private async persistDoc(workspaceId: string, docName: string, doc: Y.Doc) {
    try {
      const state = Y.encodeStateAsUpdate(doc);
      const stateBase64 = Buffer.from(state).toString("base64");
      console.log(`[YjsProvider] Persisting ${docName} (${state.length} bytes) - skipped in memory mode`);
      
      // TODO: Implement when PostgresStorage is active:
      // await this.storage.saveYjsDocument({
      //   workspaceId,
      //   docName,
      //   state: stateBase64,
      //   stateVector: Buffer.from(Y.encodeStateVector(doc)).toString("base64"),
      // });
    } catch (error) {
      console.error(`[YjsProvider] Failed to persist doc:`, error);
    }
  }

  /**
   * Cleanup all resources
   */
  async shutdown() {
    console.log("[YjsProvider] Shutting down...");

    // Persist all documents
    for (const [fullDocName, doc] of Array.from(docs.entries())) {
      const [workspaceId, docName] = fullDocName.split(":");
      await this.persistDoc(workspaceId, docName, doc.doc);
      doc.doc.destroy();
    }

    if (this.wss) {
      this.wss.close();
    }

    docs.clear();
    console.log("[YjsProvider] Shutdown complete");
  }
}

/**
 * Helper: Get or create a shared Y.Doc
 */
function getYDoc(docName: string): WSSharedDoc {
  let doc = docs.get(docName);

  if (!doc) {
    const ydoc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(ydoc);

    doc = {
      name: docName,
      doc: ydoc,
      awareness,
      conns: new Map(),
    };

    docs.set(docName, doc);
  }

  return doc;
}

/**
 * Helper: Send message to client
 */
function send(doc: WSSharedDoc, conn: WebSocket, message: Uint8Array) {
  if (
    conn.readyState !== WebSocket.CONNECTING &&
    conn.readyState !== WebSocket.OPEN
  ) {
    closeConn(doc, conn);
  } else {
    try {
      conn.send(message, (err) => {
        if (err != null) {
          closeConn(doc, conn);
        }
      });
    } catch (e) {
      closeConn(doc, conn);
    }
  }
}

/**
 * Helper: Close connection
 */
function closeConn(doc: WSSharedDoc, conn: WebSocket) {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn);
    doc.conns.delete(conn);
    if (controlledIds !== undefined && controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        doc.awareness,
        Array.from(controlledIds),
        null
      );
    }
    if (conn.readyState === WebSocket.OPEN) {
      conn.close();
    }
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
