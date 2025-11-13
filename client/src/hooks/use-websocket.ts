import { useEffect, useCallback, useRef } from 'react';
import { WebSocketClient } from '@/lib/websocket';

// Type for message handlers that receive the full message (with type)
type MessageHandler = (message: { type: string; data: any }) => void;

// Global WebSocket client instance (singleton per workspace)
let globalWsClient: WebSocketClient | null = null;
const messageHandlers = new Set<MessageHandler>();

// Track all event types we need to listen to
const eventTypes = new Set<string>();

function getGlobalWebSocket(workspaceId: string): WebSocketClient {
  if (!globalWsClient) {
    globalWsClient = new WebSocketClient(workspaceId);
  }
  return globalWsClient;
}

// Update event listeners when handlers change
function updateEventListeners() {
  if (!globalWsClient) return;
  
  // Add listeners for all event types used by handlers
  eventTypes.forEach(eventType => {
    // Remove any existing listeners for this event type
    globalWsClient!.off(eventType, handleMessage as any);
    // Add fresh listener
    globalWsClient!.on(eventType, (data: any) => {
      handleMessage({ type: eventType, data });
    });
  });
}

// Forward messages to all registered handlers
function handleMessage(message: { type: string; data: any }) {
  messageHandlers.forEach(handler => {
    try {
      handler(message);
    } catch (error) {
      console.error('Error in message handler:', error);
    }
  });
}

export function useWebSocket(workspaceId: string = 'default-workspace') {
  const wsClient = useRef<WebSocketClient | null>(null);

  useEffect(() => {
    wsClient.current = getGlobalWebSocket(workspaceId);
    
    // Listen to common event types
    const commonEvents = [
      'package_install_start',
      'package_install_log',
      'package_install_complete',
      'chat_message',
      'agent_state',
      'terminal_output',
      'terminal_complete',
      'terminal_error',
      'file_change',
    ];
    
    commonEvents.forEach(event => eventTypes.add(event));
    updateEventListeners();
    
    return () => {
      // Don't disconnect on unmount since it's a global singleton
    };
  }, [workspaceId]);

  const addMessageHandler = useCallback((handler: MessageHandler) => {
    messageHandlers.add(handler);
  }, []);

  const removeMessageHandler = useCallback((handler: MessageHandler) => {
    messageHandlers.delete(handler);
  }, []);

  const sendMessage = useCallback((data: any) => {
    wsClient.current?.send(data);
  }, []);

  return {
    addMessageHandler,
    removeMessageHandler,
    sendMessage,
  };
}
