import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage-factory";
import { sandbox } from "./sandbox";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // WebSocket server for real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  // Store active WebSocket connections by workspace ID
  const connections = new Map<string, Set<WebSocket>>();

  wss.on("connection", (ws: WebSocket) => {
    let workspaceId: string | null = null;

    ws.on("message", async (message: any) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === "join" && typeof data.workspaceId === "string") {
          const wsId = data.workspaceId;
          workspaceId = wsId;
          if (!connections.has(wsId)) {
            connections.set(wsId, new Set());
          }
          connections.get(wsId)!.add(ws);
          
          // Send current state
          const execution = await storage.getAgentExecution(wsId);
          ws.send(JSON.stringify({
            type: "agent_state",
            data: execution || { status: "idle" },
          }));
        }

        if (data.type === "chat_message" && typeof data.workspaceId === "string") {
          // Save user message
          await storage.createChatMessage(
            data.workspaceId,
            "user",
            data.content
          );

          // Broadcast to all clients in workspace
          const workspaceConnections = connections.get(data.workspaceId);
          workspaceConnections?.forEach((client) => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({
                type: "chat_message",
                data: {
                  role: "user",
                  content: data.content,
                  timestamp: new Date(),
                },
              }));
            }
          });

          // Process with AI agent
          await processAgentRequest(data.workspaceId, data.content, workspaceConnections);
        }
      } catch (error) {
        console.error("WebSocket error:", error);
      }
    });

    ws.on("close", () => {
      if (workspaceId && connections.has(workspaceId)) {
        connections.get(workspaceId)!.delete(ws);
      }
    });
  });

  async function processAgentRequest(
    workspaceId: string,
    userMessage: string,
    clients?: Set<WebSocket>
  ) {
    try {
      // Update agent state to planning
      await storage.createOrUpdateAgentExecution(
        workspaceId,
        "planning",
        "Planner"
      );

      broadcastToWorkspace(workspaceId, {
        type: "agent_state",
        data: { status: "planning", currentNode: "Planner" },
      }, clients);

      // Get workspace files for context
      const files = await storage.getFilesByWorkspace(workspaceId);
      const fileContext = files.map(f => `File: ${f.path}\n${f.content}`).join("\n\n");

      // Call OpenAI
      const stream = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are an AI coding assistant helping with a project. Here are the current files:\n\n${fileContext}\n\nProvide helpful, concise responses about the code.`,
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
        stream: true,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullResponse += content;
          
          // Stream response to clients
          broadcastToWorkspace(workspaceId, {
            type: "chat_stream",
            data: { content },
          }, clients);
        }
      }

      // Save agent response
      await storage.createChatMessage(
        workspaceId,
        "agent",
        fullResponse
      );

      // Update state to idle
      await storage.createOrUpdateAgentExecution(
        workspaceId,
        "idle"
      );

      broadcastToWorkspace(workspaceId, {
        type: "agent_state",
        data: { status: "idle" },
      }, clients);

      broadcastToWorkspace(workspaceId, {
        type: "chat_complete",
        data: {
          role: "agent",
          content: fullResponse,
          timestamp: new Date(),
        },
      }, clients);

    } catch (error) {
      console.error("Agent processing error:", error);
      
      await storage.createOrUpdateAgentExecution(
        workspaceId,
        "error"
      );

      broadcastToWorkspace(workspaceId, {
        type: "agent_error",
        data: { message: "Failed to process request" },
      }, clients);
    }
  }

  function broadcastToWorkspace(workspaceId: string, message: any, clients?: Set<any>) {
    const workspaceConnections = clients || connections.get(workspaceId);
    workspaceConnections?.forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify(message));
      }
    });
  }

  // REST API endpoints
  app.get("/api/workspaces/:id", async (req, res) => {
    const workspace = await storage.getWorkspace(req.params.id);
    if (!workspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }
    res.json(workspace);
  });

  app.get("/api/workspaces/:id/files", async (req, res) => {
    const files = await storage.getFilesByWorkspace(req.params.id);
    res.json(files);
  });

  app.post("/api/workspaces/:id/files", async (req, res) => {
    const { path, content, language } = req.body;
    const file = await storage.createFile(
      req.params.id,
      path,
      content,
      language
    );
    res.json(file);
  });

  app.put("/api/files/:id", async (req, res) => {
    const { content } = req.body;
    const file = await storage.updateFile(req.params.id, content);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    res.json(file);
  });

  app.delete("/api/files/:id", async (req, res) => {
    await storage.deleteFile(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/workspaces/:id/chat", async (req, res) => {
    const messages = await storage.getChatMessages(req.params.id);
    res.json(messages);
  });

  app.get("/api/workspaces/:id/agent", async (req, res) => {
    const execution = await storage.getAgentExecution(req.params.id);
    res.json(execution || { status: "idle" });
  });

  // Terminal execution endpoints
  app.post("/api/workspaces/:id/terminal/execute", async (req, res) => {
    const { command } = req.body;
    if (!command) {
      return res.status(400).json({ error: "Command is required" });
    }
    
    try {
      const result = await sandbox.executeCommand(command, req.params.id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/workspaces/:id/files/:fileId/execute", async (req, res) => {
    const file = await storage.getFile(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    
    try {
      const result = await sandbox.executeFile(file.path, req.params.id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/workspaces/:id/packages/install", async (req, res) => {
    const { packages, packageManager } = req.body;
    if (!packages || !Array.isArray(packages)) {
      return res.status(400).json({ error: "Packages array is required" });
    }
    if (!["npm", "pip"].includes(packageManager)) {
      return res.status(400).json({ error: "Package manager must be 'npm' or 'pip'" });
    }
    
    try {
      const result = await sandbox.installPackages(packages, packageManager, req.params.id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
