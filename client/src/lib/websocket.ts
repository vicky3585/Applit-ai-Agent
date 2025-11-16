export class WebSocketClient {
  private ws: WebSocket | null = null;
  private workspaceId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private wsToken: string | null = null;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
    this.connect();
  }

  private async fetchToken(): Promise<string | null> {
    try {
      const response = await fetch("/api/auth/ws-token", {
        credentials: "include",
      });
      if (!response.ok) {
        console.error("Failed to fetch WebSocket token");
        return null;
      }
      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error("Error fetching WebSocket token:", error);
      return null;
    }
  }

  private async connect() {
    // Fetch authentication token first
    if (!this.wsToken) {
      this.wsToken = await this.fetchToken();
      if (!this.wsToken) {
        console.error("Cannot connect WebSocket without authentication token");
        setTimeout(() => this.attemptReconnect(), 2000);
        return;
      }
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("WebSocket connected");
      this.reconnectAttempts = 0;
      
      // Join workspace with authentication token
      this.send({
        type: "join",
        workspaceId: this.workspaceId,
        token: this.wsToken,
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.emit(message.type, message.data);
      } catch (error) {
        console.error("Failed to parse WebSocket message:", error);
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    this.ws.onclose = () => {
      console.log("WebSocket closed");
      this.attemptReconnect();
    };
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      setTimeout(() => {
        console.log(`Reconnecting... (attempt ${this.reconnectAttempts})`);
        this.connect();
      }, 1000 * this.reconnectAttempts);
    }
  }

  send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: any) => void) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
    }
  }

  private emit(event: string, data: any) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((callback) => callback(data));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
