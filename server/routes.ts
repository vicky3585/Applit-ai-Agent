import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createProxyMiddleware } from "http-proxy-middleware";
import { storage } from "./storage-factory";
import { sandbox } from "./sandbox";
import OpenAI from "openai";
import { ENV_CONFIG, validateDockerAccess, validateDatabaseAccess, getServiceUrl } from "@shared/environment";
import { installPackageRequestSchema } from "@shared/schema";

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

  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    const dockerAvailable = await validateDockerAccess();
    const dbAvailable = await validateDatabaseAccess();

    res.json({
      status: "ok",
      environment: ENV_CONFIG.env,
      services: {
        docker: {
          configured: ENV_CONFIG.sandbox.mode === "docker",
          accessible: dockerAvailable,
        },
        database: {
          configured: ENV_CONFIG.database.mode,
          accessible: dbAvailable,
        },
        codeServer: {
          configured: ENV_CONFIG.codeServer.mode === "docker",
          url: ENV_CONFIG.codeServer.url || null,
        },
        gpu: {
          available: ENV_CONFIG.gpu.available,
          device: ENV_CONFIG.gpu.device,
        },
      },
    });
  });

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

  app.patch("/api/files/:id/rename", async (req, res) => {
    const { newPath } = req.body;
    if (!newPath) {
      return res.status(400).json({ error: "newPath is required" });
    }
    
    try {
      const file = await storage.renameFile(req.params.id, newPath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      res.json(file);
    } catch (error: any) {
      if (error.message === "A file already exists at the target path") {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }
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

  // Python Agent - Code generation endpoint
  app.post("/api/workspaces/:id/agent/generate", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Check if Python agent is available
    const pythonAgentUrl = getServiceUrl("python-agent");
    if (!pythonAgentUrl) {
      return res.status(503).json({ 
        error: "Python agent service not available",
        message: "Python agent requires local Docker environment"
      });
    }

    try {
      // Get existing files for context
      const files = await storage.getFilesByWorkspace(req.params.id);
      
      // Call Python agent service
      const response = await fetch(`${pythonAgentUrl}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          workspace_id: req.params.id,
          existing_files: files.map(f => ({
            path: f.path,
            language: f.language,
            content: f.content // ✅ Full content, no truncation
          })),
          context: {}
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Python agent error: ${error}`);
      }

      const result = await response.json();
      
      // Create files returned by agent
      if (result.files_generated && result.files_generated.length > 0) {
        for (const file of result.files_generated) {
          await storage.createFile(
            req.params.id,
            file.path,
            file.content,
            file.language || "plaintext"
          );
        }
      }

      res.json(result);
    } catch (error: any) {
      console.error("[Agent] Generation error:", error);
      res.status(500).json({ error: error.message });
    }
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

  // Package Management Routes
  
  // GET /api/workspaces/:id/packages - List installed packages
  app.get("/api/workspaces/:id/packages", async (req, res) => {
    try {
      const packages = await storage.getPackages(req.params.id);
      res.json(packages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/workspaces/:id/packages/install - Install package(s)
  app.post("/api/workspaces/:id/packages/install", async (req, res) => {
    const workspaceId = req.params.id;
    
    // Validate request body using Zod
    const validation = installPackageRequestSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ 
        errorCode: "INVALID_REQUEST",
        error: "Invalid request body",
        details: validation.error.errors 
      });
    }
    
    const { packages, packageManager } = validation.data;
    
    // Broadcast install progress to workspace
    const workspaceConnections = connections.get(workspaceId);
    function broadcastProgress(message: string) {
      workspaceConnections?.forEach((client) => {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: "package_install_progress",
            data: { message, packageManager, packages },
          }));
        }
      });
    }
    
    try {
      broadcastProgress("Installing packages...");
      
      // Install packages using sandbox
      const result = await sandbox.installPackages(packages, packageManager as any, workspaceId);
      
      if (result.exitCode !== 0) {
        // Parse error message
        const errorOutput = result.error || result.output || "Unknown error";
        let errorCode = "INSTALL_FAILED";
        let errorMessage = errorOutput;
        
        if (errorOutput.includes("404") || errorOutput.includes("not found") || errorOutput.includes("No matching")) {
          errorCode = "PACKAGE_NOT_FOUND";
          errorMessage = "One or more packages were not found in the registry.";
        } else if (errorOutput.includes("EACCES") || errorOutput.includes("permission denied")) {
          errorCode = "PERMISSION_DENIED";
          errorMessage = "Permission denied. Try using a different package manager.";
        } else if (errorOutput.includes("ENOTFOUND") || errorOutput.includes("network")) {
          errorCode = "NETWORK_ERROR";
          errorMessage = "Network error. Please check your connection.";
        }
        
        broadcastProgress(`Installation failed: ${errorMessage}`);
        return res.status(400).json({ errorCode, error: errorMessage, details: errorOutput });
      }
      
      // Parse versions and save to storage
      broadcastProgress("Verifying installed versions...");
      const installedPackages = [];
      
      for (const pkgName of packages) {
        try {
          let version: string | null = null;
          
          // Parse version based on package manager
          if (packageManager === "npm") {
            const versionCmd = await sandbox.executeCommand(
              `npm ls ${pkgName} --json --depth=0`,
              workspaceId
            );
            if (versionCmd.exitCode === 0 && versionCmd.output) {
              try {
                const parsed = JSON.parse(versionCmd.output);
                version = parsed.dependencies?.[pkgName]?.version || null;
              } catch {}
            }
          } else if (packageManager === "pip") {
            const versionCmd = await sandbox.executeCommand(
              `pip show ${pkgName}`,
              workspaceId
            );
            if (versionCmd.exitCode === 0 && versionCmd.output) {
              const match = versionCmd.output.match(/^Version:\s*(.+)$/m);
              version = match ? match[1].trim() : null;
            }
          } else if (packageManager === "apt") {
            const versionCmd = await sandbox.executeCommand(
              `apt-cache policy ${pkgName}`,
              workspaceId
            );
            if (versionCmd.exitCode === 0 && versionCmd.output) {
              const match = versionCmd.output.match(/Installed:\s*(.+)/);
              version = match && match[1] !== "(none)" ? match[1].trim() : null;
            }
          }
          
          // Save to storage
          const pkg = await storage.upsertPackage(workspaceId, pkgName, version, packageManager);
          installedPackages.push(pkg);
        } catch (error) {
          console.error(`Failed to parse version for ${pkgName}:`, error);
          // Still save package even if version parsing fails
          const pkg = await storage.upsertPackage(workspaceId, pkgName, null, packageManager);
          installedPackages.push(pkg);
        }
      }
      
      broadcastProgress(`Successfully installed ${packages.length} package(s)`);
      res.json({ 
        success: true, 
        packages: installedPackages,
        output: result.output 
      });
    } catch (error: any) {
      broadcastProgress(`Installation failed: ${error.message}`);
      res.status(500).json({ 
        errorCode: "INTERNAL_ERROR",
        error: error.message 
      });
    }
  });
  
  // DELETE /api/workspaces/:id/packages/:packageId - Uninstall package
  app.delete("/api/workspaces/:id/packages/:packageId", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const packageId = req.params.packageId;
      
      // Get package to delete
      const allPackages = await storage.getPackages(workspaceId);
      const packageToDelete = allPackages.find(p => p.id === packageId);
      
      if (!packageToDelete) {
        return res.status(404).json({ 
          errorCode: "PACKAGE_NOT_FOUND",
          error: "Package not found in workspace" 
        });
      }
      
      // Uninstall via sandbox command
      const uninstallCmd = packageToDelete.packageManager === "npm" 
        ? `npm uninstall ${packageToDelete.name}`
        : packageToDelete.packageManager === "pip"
        ? `pip uninstall -y ${packageToDelete.name}`
        : `apt-get remove -y ${packageToDelete.name}`;
      
      console.log(`[Packages] Uninstalling ${packageToDelete.name} via: ${uninstallCmd}`);
      const result = await sandbox.executeCommand(uninstallCmd, workspaceId);
      
      // Check if uninstall succeeded
      if (result.exitCode !== 0) {
        const errorOutput = result.error || result.output || "Unknown error";
        console.error(`[Packages] Uninstall failed:`, errorOutput);
        
        return res.status(400).json({ 
          errorCode: "UNINSTALL_FAILED",
          error: "Failed to uninstall package from sandbox",
          details: errorOutput
        });
      }
      
      // Only remove from storage after successful sandbox uninstall
      await storage.deletePackage(packageId);
      
      console.log(`[Packages] Successfully uninstalled ${packageToDelete.name}`);
      res.json({ 
        success: true,
        message: `${packageToDelete.name} uninstalled successfully` 
      });
    } catch (error: any) {
      console.error("[Packages] Uninstall error:", error);
      res.status(500).json({ 
        errorCode: "INTERNAL_ERROR",
        error: error.message 
      });
    }
  });

  // Store proxy instances for WebSocket upgrade handling
  const proxies: Array<{ path: string; proxy: any }> = [];

  // Code-server proxy (only in local mode with Docker)
  if (ENV_CONFIG.codeServer.mode === "docker" && ENV_CONFIG.codeServer.url) {
    console.log(`[Proxy] Setting up code-server proxy to ${ENV_CONFIG.codeServer.url}`);
    
    const codeServerProxy = createProxyMiddleware({
      target: ENV_CONFIG.codeServer.url,
      changeOrigin: true,
      ws: true, // Enable WebSocket proxying
      pathRewrite: {
        "^/code-server": "", // Remove /code-server prefix when forwarding
      },
      logger: console,
    });
    
    app.use("/code-server", codeServerProxy);
    proxies.push({ path: "/code-server", proxy: codeServerProxy });
  }

  // Live preview proxy for running web apps (port 3000 in sandbox)
  if (ENV_CONFIG.sandbox.mode === "docker") {
    console.log("[Proxy] Setting up live preview proxy to sandbox:3000");
    
    const previewProxy = createProxyMiddleware({
      target: "http://sandbox:3000", // Default development server port
      changeOrigin: true,
      ws: true, // Enable WebSocket for hot reload
      pathRewrite: {
        "^/preview": "",
      },
      logger: console,
    });
    
    app.use("/preview", previewProxy);
    proxies.push({ path: "/preview", proxy: previewProxy });
  }

  // Register WebSocket upgrade handler for all proxies
  if (proxies.length > 0) {
    httpServer.on("upgrade", (req, socket, head) => {
      const url = req.url || "";
      
      // Find matching proxy by path prefix
      for (const { path, proxy } of proxies) {
        if (url.startsWith(path)) {
          console.log(`[Proxy] Upgrading WebSocket for ${path}`);
          proxy.upgrade!(req, socket, head);
          return;
        }
      }
      
      // No matching proxy - let the default WebSocket handler take over
      console.log(`[Proxy] No proxy matched for upgrade: ${url}`);
    });
  }

  return httpServer;
}
