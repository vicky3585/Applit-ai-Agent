import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createProxyMiddleware } from "http-proxy-middleware";
import { storage } from "./storage-factory";
import { sandbox } from "./sandbox";
import OpenAI from "openai";
import { ENV_CONFIG, validateDockerAccess, validateDatabaseAccess, getServiceUrl } from "@shared/environment";
import { installPackageRequestSchema } from "@shared/schema";
import { templates, getTemplateById } from "./templates";
import * as github from "./github";
import * as git from "./git";
import { initializeYjsProvider } from "./yjs-provider";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize Yjs provider for real-time collaborative editing (Phase 7)
  const yjsProvider = initializeYjsProvider(httpServer, await storage);
  console.log("[Phase 7] Yjs collaborative editing provider initialized");
  
  // WebSocket server for real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  // Store active WebSocket connections by workspace ID
  const connections = new Map<string, Set<WebSocket>>();

  wss.on("connection", (ws: WebSocket & { workspaceId?: string }) => {
    let workspaceId: string | null = null;
    let hasJoined = false;

    // Set timeout to close connection if client doesn't join within 10 seconds
    const joinTimeout = setTimeout(() => {
      if (!hasJoined) {
        console.log("[WebSocket] Client did not join, closing connection");
        ws.close();
      }
    }, 10000);

    ws.on("message", async (message: any) => {
      try {
        const data = JSON.parse(message.toString());

        if (data.type === "join" && typeof data.workspaceId === "string") {
          const wsId = data.workspaceId;
          workspaceId = wsId;
          ws.workspaceId = wsId; // Store workspace ID on client for filtering
          hasJoined = true;
          clearTimeout(joinTimeout);
          
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
          return; // Don't process other messages until joined
        }

        // Require join before processing other messages
        if (!hasJoined || !workspaceId) {
          console.log("[WebSocket] Message received before join, ignoring");
          return;
        }

        // Type guard: workspaceId is guaranteed non-null after this point
        const authenticatedWorkspaceId: string = workspaceId;

        if (data.type === "chat_message") {
          // Security: Verify workspace ID matches authenticated session
          if (data.workspaceId !== authenticatedWorkspaceId) {
            console.warn(`[WebSocket] Workspace mismatch: attempted ${data.workspaceId}, authenticated as ${authenticatedWorkspaceId}`);
            return;
          }

          // Save user message
          await storage.createChatMessage(
            authenticatedWorkspaceId,
            "user",
            data.content
          );

          // Broadcast to all clients in workspace
          const workspaceConnections = connections.get(authenticatedWorkspaceId);
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
          await processAgentRequest(authenticatedWorkspaceId, data.content, workspaceConnections);
        }

        if (data.type === "terminal_command" && typeof data.command === "string") {
          // Security: Verify workspace ID matches authenticated session
          if (data.workspaceId && data.workspaceId !== authenticatedWorkspaceId) {
            console.warn(`[WebSocket] Workspace mismatch: attempted ${data.workspaceId}, authenticated as ${authenticatedWorkspaceId}`);
            return;
          }

          const workspaceConnections = connections.get(authenticatedWorkspaceId);
          
          try {
            // Execute command with streaming output
            const result = await sandbox.executeCommandWithOptions({
              workspaceId: authenticatedWorkspaceId,
              command: data.command,
              onOutput: (chunk: string) => {
                // Broadcast each output chunk in real-time
                broadcastToWorkspace(authenticatedWorkspaceId, {
                  type: "terminal_output",
                  data: { chunk },
                }, workspaceConnections);
              },
            });
            
            // Broadcast completion
            broadcastToWorkspace(authenticatedWorkspaceId, {
              type: "terminal_complete",
              data: { 
                success: result.success, 
                exitCode: result.exitCode,
                error: result.error 
              },
            }, workspaceConnections);
          } catch (error: any) {
            broadcastToWorkspace(authenticatedWorkspaceId, {
              type: "terminal_error",
              data: { message: error.message || "Command execution failed" },
            }, workspaceConnections);
          }
        }
      } catch (error) {
        console.error("WebSocket error:", error);
      }
    });

    ws.on("close", () => {
      clearTimeout(joinTimeout);
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
      // Get workspace context
      const files = await storage.getFilesByWorkspace(workspaceId);
      const settings = await storage.getWorkspaceSettings(workspaceId);
      
      // Import and create orchestrator
      const { AgentOrchestrator } = await import("./agents/orchestrator");
      const orchestrator = new AgentOrchestrator(storage);

      // Create agent context (max attempts will be read from settings inside orchestrator)
      const context = {
        workspaceId,
        prompt: userMessage,
        existingFiles: files,
        settings: settings || null,
        openai,
      };

      // Execute workflow with real-time updates
      const result = await orchestrator.executeWorkflow(context, (state) => {
        // Update storage
        storage.createOrUpdateAgentExecution(workspaceId, {
          prompt: userMessage,
          status: state.status,
          current_step: state.currentStep,
          progress: state.progress,
          attempt_count: state.attemptCount,
          logs: state.logs,
          files_generated: state.filesGenerated,
          errors: state.errors,
        });

        // Broadcast state updates
        broadcastToWorkspace(workspaceId, {
          type: "agent_state",
          data: {
            status: state.status,
            currentStep: state.currentStep,
            progress: state.progress,
          },
        }, clients);

        // Stream logs to chat
        if (state.logs.length > 0) {
          const latestLog = state.logs[state.logs.length - 1];
          broadcastToWorkspace(workspaceId, {
            type: "chat_stream",
            data: { content: latestLog + "\n" },
          }, clients);
        }

        // Broadcast file updates when files are generated
        if (state.filesGenerated && state.filesGenerated.length > 0) {
          broadcastToWorkspace(workspaceId, {
            type: "files_updated",
            data: { fileCount: state.filesGenerated.length },
          }, clients);
        }
      });

      // Send appropriate final message based on workflow result
      let finalMessage: string;
      if (result.status === "complete") {
        const fileCount = result.filesGenerated.length;
        finalMessage = `Workflow completed successfully! Generated ${fileCount} file(s).`;
        
        await storage.createChatMessage(
          workspaceId,
          "agent",
          finalMessage
        );

        broadcastToWorkspace(workspaceId, {
          type: "chat_complete",
          data: {
            role: "agent",
            content: finalMessage,
            timestamp: new Date(),
          },
        }, clients);
      } else {
        // Workflow failed
        const errorDetails = result.errors.length > 0 ? result.errors.join("; ") : "Unknown error";
        finalMessage = `Workflow failed after ${result.attemptCount} attempt(s). Error: ${errorDetails}`;
        
        await storage.createChatMessage(
          workspaceId,
          "agent",
          finalMessage
        );

        broadcastToWorkspace(workspaceId, {
          type: "agent_error",
          data: { message: finalMessage },
        }, clients);
      }

    } catch (error: any) {
      console.error("Agent processing error:", error);
      
      await storage.createOrUpdateAgentExecution(workspaceId, {
        prompt: userMessage,
        status: "failed",
        current_step: "idle",
        progress: 0.0,
        logs: [`Error: ${error.message}`],
        files_generated: [],
        errors: [error.message],
      });

      broadcastToWorkspace(workspaceId, {
        type: "agent_error",
        data: { message: error.message || "Failed to process request" },
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

  app.get("/api/workspaces/:id/settings", async (req, res) => {
    const settings = await storage.getWorkspaceSettings(req.params.id);
    res.json(settings || {});
  });

  app.put("/api/workspaces/:id/settings", async (req, res) => {
    const settings = await storage.upsertWorkspaceSettings(req.params.id, req.body);
    res.json(settings);
  });

  app.get("/api/workspaces/:id/api-key-status", async (req, res) => {
    res.json({ 
      configured: !!process.env.OPENAI_API_KEY,
      keyType: process.env.OPENAI_API_KEY?.startsWith('sk-') ? 'valid' : 'invalid'
    });
  });

  app.get("/api/workspaces/:id/preview-url", async (req, res) => {
    // Return the preview URL for the workspace
    // Check if there's an HTML file to preview
    const workspaceId = req.params.id;
    const files = await storage.getFilesByWorkspace(workspaceId);
    
    // Look for HTML files
    const htmlFiles = files.filter(f => 
      f.path.endsWith('.html') || f.path.endsWith('.htm')
    );
    
    // Force HTTPS when X-Forwarded-Proto is https or when host contains replit.dev
    const host = req.get('host') || '';
    const forwardedProto = req.get('x-forwarded-proto');
    const isSecure = forwardedProto === 'https' || host.includes('replit.dev') || req.secure;
    const protocol = isSecure ? 'https' : req.protocol;
    const baseUrl = `${protocol}://${host}`;
    
    // If there are HTML files, suggest the first one
    if (htmlFiles.length > 0) {
      const firstHtml = htmlFiles[0];
      res.json({ 
        url: `${baseUrl}/preview/${workspaceId}/${firstHtml.path}`,
        hasHtmlFiles: true,
        htmlFiles: htmlFiles.map(f => ({
          path: f.path,
          url: `${baseUrl}/preview/${workspaceId}/${f.path}`
        }))
      });
    } else {
      res.json({ url: baseUrl, hasHtmlFiles: false });
    }
  });

  // Serve workspace files for preview (HTML, CSS, JS, etc.)
  app.get("/preview/:workspaceId/*", async (req, res) => {
    try {
      const workspaceId = req.params.workspaceId;
      const filePath = req.params[0]; // Everything after /preview/:workspaceId/
      
      if (!filePath) {
        return res.status(400).send("File path required");
      }

      // Get all files in workspace
      const files = await storage.getFilesByWorkspace(workspaceId);
      
      // Find the requested file
      const file = files.find(f => f.path === filePath);
      
      if (!file) {
        return res.status(404).send(`File not found: ${filePath}`);
      }

      // Set content type based on file extension
      const ext = filePath.split('.').pop()?.toLowerCase();
      const contentTypes: Record<string, string> = {
        'html': 'text/html',
        'htm': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'json': 'application/json',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'txt': 'text/plain',
      };

      const contentType = contentTypes[ext || ''] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.send(file.content);
    } catch (error: any) {
      console.error("[Preview] Error serving file:", error);
      res.status(500).send("Error loading file");
    }
  });

  app.post("/api/workspaces/:id/start-server", async (req, res) => {
    try {
      const { getDevServerManager } = await import("./dev-server-manager");
      const { getFilePersistence } = await import("./file-persistence");
      
      const manager = getDevServerManager();
      const persistence = getFilePersistence();
      const workspaceId = req.params.id;
      
      // Only works if file persistence is enabled
      if (!persistence) {
        return res.status(400).json({ error: "File persistence not enabled" });
      }

      const workspacePath = `/tmp/ide-workspaces/${workspaceId}`;
      const server = await manager.startServer(workspaceId, workspacePath);
      
      if (!server) {
        return res.status(400).json({ error: "Could not start server" });
      }

      res.json({
        url: server.url,
        port: server.port,
        type: server.type,
      });
    } catch (error: any) {
      console.error("[API] Error starting server:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/workspaces/:id/stop-server", async (req, res) => {
    try {
      const { getDevServerManager } = await import("./dev-server-manager");
      const manager = getDevServerManager();
      
      await manager.stopServer(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      console.error("[API] Error stopping server:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/workspaces/:id/agent", async (req, res) => {
    const execution = await storage.getAgentExecution(req.params.id);
    res.json(execution || { status: "idle" });
  });

  // AI Agent - Status endpoint for polling
  app.get("/api/workspaces/:id/agent/status", async (req, res) => {
    try {
      const execution = await storage.getAgentExecution(req.params.id);
      
      if (!execution) {
        return res.json({ 
          status: "idle",
          current_step: "idle",
          progress: 0.0,
          attempt_count: 0,
          logs: [],
          files_generated: [],
          errors: []
        });
      }
      
      // JSONB fields are already parsed objects
      const logs = Array.isArray(execution.logs) ? execution.logs : [];
      const files_generated = Array.isArray(execution.files_generated) ? execution.files_generated : [];
      const errors = Array.isArray(execution.errors) ? execution.errors : [];
      
      res.json({
        status: execution.status,
        current_step: execution.current_step,
        progress: execution.progress,
        attempt_count: execution.attempt_count || 0,
        logs,
        files_generated,
        errors,
      });
    } catch (error: any) {
      console.error("[Agent] Status error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Agent - Result endpoint for final output
  app.get("/api/workspaces/:id/agent/result", async (req, res) => {
    try {
      const execution = await storage.getAgentExecution(req.params.id);
      
      if (!execution) {
        return res.json({ 
          status: "idle",
          files_generated: [],
          logs: [],
          errors: []
        });
      }
      
      if (execution.status !== "complete" && execution.status !== "failed") {
        return res.status(202).json({ 
          status: execution.status,
          message: "Agent is still processing"
        });
      }
      
      // JSONB fields are already parsed objects
      const logs = Array.isArray(execution.logs) ? execution.logs : [];
      const files_generated = Array.isArray(execution.files_generated) ? execution.files_generated : [];
      const errors = Array.isArray(execution.errors) ? execution.errors : [];
      
      res.json({
        status: execution.status,
        files_generated,
        logs,
        errors,
      });
    } catch (error: any) {
      console.error("[Agent] Result error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Agent - Code generation endpoint (async with status polling)
  app.post("/api/workspaces/:id/agent/generate", async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const workspaceId = req.params.id;
    
    // Create initial execution record
    const execution = await storage.createOrUpdateAgentExecution(workspaceId, {
      prompt,
      status: "processing",
      current_step: "planning",
      progress: 0.0,
      logs: ["Starting AI agent workflow..."],
      files_generated: [],
      errors: [],
    });

    // Return immediately with 202 Accepted
    res.status(202).json({ 
      executionId: execution.id,
      status: "processing"
    });

    // Run orchestrator asynchronously
    (async () => {
      const pythonAgentUrl = getServiceUrl("python-agent");
      
      // If Python agent is available, use it
      if (pythonAgentUrl) {
        try {
          const files = await storage.getFilesByWorkspace(workspaceId);
          
          const response = await fetch(`${pythonAgentUrl}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              workspace_id: workspaceId,
              existing_files: files.map(f => ({
                path: f.path,
                language: f.language,
                content: f.content
              })),
              context: {}
            })
          });

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`Python agent error: ${error}`);
          }

          const result = await response.json();
          
          if (result.files_generated && result.files_generated.length > 0) {
            for (const file of result.files_generated) {
              await storage.createFile(
                workspaceId,
                file.path,
                file.content,
                file.language || "plaintext"
              );
            }
          }

          // Update execution with result
          await storage.createOrUpdateAgentExecution(workspaceId, {
            prompt,
            status: result.status || "complete",
            current_step: "complete",
            progress: 1.0,
            logs: result.logs || [],
            files_generated: result.files_generated || [],
            errors: result.errors || [],
          });
          
          return;
        } catch (error: any) {
          console.error("[Agent] Python agent error:", error);
          // Fall through to TypeScript orchestrator
        }
      }

      // Fallback: Use TypeScript orchestrator with OpenAI
      try {
        console.log("[Agent] Using TypeScript orchestrator (Python agent not available)");
        
        const { AgentOrchestrator } = await import("./agents/orchestrator");
        const OpenAI = (await import("openai")).default;
        
        const files = await storage.getFilesByWorkspace(workspaceId);
        const settings = await storage.getWorkspaceSettings(workspaceId) || null;
        
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        });
        
        const orchestrator = new AgentOrchestrator(storage);
        
        const result = await orchestrator.executeWorkflow(
          {
            workspaceId,
            prompt,
            existingFiles: files,
            settings,
            openai,
          },
          async (state) => {
            // Update execution in storage
            await storage.createOrUpdateAgentExecution(workspaceId, {
              prompt,
              status: state.status,
              current_step: state.currentStep,
              progress: state.progress,
              attempt_count: state.attemptCount,
              logs: state.logs,
              files_generated: state.filesGenerated,
              errors: state.errors,
            });
            
            // Broadcast state updates via WebSocket
            wss.clients.forEach((client: any) => {
              if (client.readyState === 1 && client.workspaceId === workspaceId) {
                client.send(JSON.stringify({
                  type: "agent-state-update",
                  data: state,
                }));
              }
            });
          }
        );
        
        // Create generated files
        if (result.filesGenerated && result.filesGenerated.length > 0) {
          for (const file of result.filesGenerated) {
            await storage.createFile(
              workspaceId,
              file.path,
              file.content,
              file.language || "plaintext"
            );
            
            // Broadcast file creation
            wss.clients.forEach((client: any) => {
              if (client.readyState === 1 && client.workspaceId === workspaceId) {
                client.send(JSON.stringify({
                  type: "file-created",
                  data: { path: file.path },
                }));
              }
            });
          }
        }
        
        console.log("[Agent] Workflow completed successfully");
      } catch (error: any) {
        console.error("[Agent] Generation error:", error);
        
        // Update execution with error
        await storage.createOrUpdateAgentExecution(workspaceId, {
          prompt,
          status: "failed",
          current_step: "idle",
          progress: 0.0,
          logs: [`Error: ${error.message}`],
          files_generated: [],
          errors: [error.message],
        });
      }
    })().catch(err => console.error("[Agent] Async error:", err));
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

  // GET /api/workspaces/:id/executions - Get execution history
  app.get("/api/workspaces/:id/executions", async (req, res) => {
    try {
      const executions = await storage.getCodeExecutions(req.params.id);
      res.json(executions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/workspaces/:id/executions/:executionId - Get specific execution
  app.get("/api/workspaces/:id/executions/:executionId", async (req, res) => {
    try {
      const execution = await storage.getCodeExecution(req.params.executionId);
      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }
      res.json(execution);
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
      // Create execution record
      const execution = await storage.createCodeExecution(
        req.params.id,
        file.path,
        file.language || undefined
      );

      // Send execution started event
      broadcastToWorkspace(req.params.id, {
        type: "execution_started",
        data: execution,
      });

      // Return execution ID immediately (execution happens in background)
      res.json({ executionId: execution.id, status: 'running' });

      // Setup streaming with throttling
      let accumulatedOutput = "";
      let totalBytes = 0;
      let lastBroadcast = 0;
      const BROADCAST_THROTTLE_MS = 100; // 100ms throttle
      let broadcastTimer: NodeJS.Timeout | null = null;

      const flushOutput = async () => {
        if (accumulatedOutput) {
          try {
            broadcastToWorkspace(req.params.id, {
              type: "execution_output",
              data: {
                executionId: execution.id,
                chunk: accumulatedOutput,
                totalBytes,
              },
            });

            // Append to storage
            await storage.appendCodeExecutionOutput(execution.id, accumulatedOutput);
            accumulatedOutput = "";
          } catch (error) {
            console.error("[Execution] Failed to flush output:", error);
            throw error;
          }
        }
      };

      const onOutput = (chunk: string) => {
        accumulatedOutput += chunk;
        totalBytes += chunk.length;
        
        const now = Date.now();
        if (now - lastBroadcast >= BROADCAST_THROTTLE_MS) {
          lastBroadcast = now;
          if (broadcastTimer) {
            clearTimeout(broadcastTimer);
            broadcastTimer = null;
          }
          flushOutput().catch(err => console.error("Failed to flush output:", err));
        } else if (!broadcastTimer) {
          broadcastTimer = setTimeout(async () => {
            broadcastTimer = null;
            lastBroadcast = Date.now();
            await flushOutput();
          }, BROADCAST_THROTTLE_MS);
        }
      };

      // Execute with streaming callback
      console.log(`[Execution] Starting file execution: ${file.path}`);
      sandbox.executeFileWithOptions({
        workspaceId: req.params.id,
        filePath: file.path,
        languageHint: file.language || undefined,
        onOutput,
      })
        .then(async (result) => {
          console.log(`[Execution] Promise resolved for ${file.path}, result:`, result);
          try {
            // Clear timer first
            if (broadcastTimer) {
              clearTimeout(broadcastTimer);
              broadcastTimer = null;
            }
            
            // Flush remaining output before marking complete
            await flushOutput();
            console.log(`[Execution] Output flushed for ${file.path}`);

            // Update execution record with final result (don't overwrite output - it was streamed incrementally)
            await storage.updateCodeExecution(execution.id, {
              status: 'completed',
              error: result.error || null,
              exitCode: result.exitCode !== undefined && result.exitCode !== null ? String(result.exitCode) : null,
              completedAt: new Date(),
            });
            console.log(`[Execution] Updated execution record: ${execution.id}`);

            // Broadcast completion
            const updated = await storage.getCodeExecution(execution.id);
            broadcastToWorkspace(req.params.id, {
              type: "execution_completed",
              data: updated,
            });
            console.log(`[Execution] Broadcast completion for ${file.path}`);
          } catch (error: any) {
            console.error("[Execution] Failed to complete execution:", error);
            // Mark as failed if flush/update fails
            await storage.updateCodeExecution(execution.id, {
              status: 'failed',
              error: `Completion error: ${error.message}`,
              completedAt: new Date(),
            });
          }
        })
        .catch(async (error) => {
          console.error(`[Execution] Promise rejected for ${file.path}:`, error);
          try {
            // Clear timer first
            if (broadcastTimer) {
              clearTimeout(broadcastTimer);
              broadcastTimer = null;
            }
            
            // Flush remaining output before marking failed
            await flushOutput();
          } catch (flushError) {
            console.error("[Execution] Failed to flush on error:", flushError);
          }

          // Update execution record with error
          await storage.updateCodeExecution(execution.id, {
            status: 'failed',
            error: error.message,
            completedAt: new Date(),
          });

          // Broadcast error
          const updated = await storage.getCodeExecution(execution.id);
          broadcastToWorkspace(req.params.id, {
            type: "execution_failed",
            data: updated,
          });
          console.log(`[Execution] Broadcast failure for ${file.path}`);
        });
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

  // GET /api/templates - List all available templates
  app.get("/api/templates", (_req, res) => {
    try {
      // Return templates without full file content for listing
      const templateList = templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        language: t.language,
        framework: t.framework,
        icon: t.icon,
        devCommand: t.devCommand,
        buildCommand: t.buildCommand,
      }));
      res.json(templateList);
    } catch (error: any) {
      console.error("[Templates] List error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/workspaces/:id/apply-template - Apply template to workspace
  app.post("/api/workspaces/:id/apply-template", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const { templateId } = req.body;

      if (!templateId) {
        return res.status(400).json({ 
          errorCode: "INVALID_REQUEST",
          error: "Template ID is required" 
        });
      }

      const template = getTemplateById(templateId);
      if (!template) {
        return res.status(404).json({ 
          errorCode: "TEMPLATE_NOT_FOUND",
          error: "Template not found" 
        });
      }

      console.log(`[Templates] Applying template ${template.name} to workspace ${workspaceId}`);

      // Create all template files
      const createdFiles = [];
      for (const templateFile of template.files) {
        const file = await storage.createFile(
          workspaceId,
          templateFile.path,
          templateFile.content,
          templateFile.language
        );
        createdFiles.push(file);
      }

      console.log(`[Templates] Created ${createdFiles.length} files`);

      // Broadcast progress via WebSocket
      const wsClients = connections.get(workspaceId);
      const broadcastProgress = (message: string) => {
        if (wsClients) {
          wsClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "template_progress",
                message,
              }));
            }
          });
        }
      };

      // Install packages if specified
      if (template.packages) {
        if (template.packages.npm && template.packages.npm.length > 0) {
          broadcastProgress(`Installing npm packages: ${template.packages.npm.join(", ")}`);
          try {
            const result = await sandbox.installPackages(template.packages.npm, "npm", workspaceId);
            if (result.exitCode === 0) {
              console.log(`[Templates] npm packages installed successfully`);
              broadcastProgress("npm packages installed successfully");
              
              // Save packages to storage
              for (const pkgName of template.packages.npm) {
                await storage.upsertPackage(workspaceId, pkgName, null, "npm");
              }
            } else {
              console.error(`[Templates] npm install failed:`, result.error || result.output);
              broadcastProgress(`Warning: npm install failed - ${result.error || "unknown error"}`);
            }
          } catch (error: any) {
            console.error(`[Templates] npm install error:`, error);
            broadcastProgress(`Warning: npm install error - ${error.message}`);
          }
        }

        if (template.packages.pip && template.packages.pip.length > 0) {
          broadcastProgress(`Installing pip packages: ${template.packages.pip.join(", ")}`);
          try {
            const result = await sandbox.installPackages(template.packages.pip, "pip", workspaceId);
            if (result.exitCode === 0) {
              console.log(`[Templates] pip packages installed successfully`);
              broadcastProgress("pip packages installed successfully");
              
              // Save packages to storage
              for (const pkgName of template.packages.pip) {
                await storage.upsertPackage(workspaceId, pkgName, null, "pip");
              }
            } else {
              console.error(`[Templates] pip install failed:`, result.error || result.output);
              broadcastProgress(`Warning: pip install failed - ${result.error || "unknown error"}`);
            }
          } catch (error: any) {
            console.error(`[Templates] pip install error:`, error);
            broadcastProgress(`Warning: pip install error - ${error.message}`);
          }
        }

        if (template.packages.apt && template.packages.apt.length > 0) {
          broadcastProgress(`Installing apt packages: ${template.packages.apt.join(", ")}`);
          try {
            const result = await sandbox.installPackages(template.packages.apt, "apt", workspaceId);
            if (result.exitCode === 0) {
              console.log(`[Templates] apt packages installed successfully`);
              broadcastProgress("apt packages installed successfully");
              
              // Save packages to storage
              for (const pkgName of template.packages.apt) {
                await storage.upsertPackage(workspaceId, pkgName, null, "apt");
              }
            } else {
              console.error(`[Templates] apt install failed:`, result.error || result.output);
              broadcastProgress(`Warning: apt install failed - ${result.error || "unknown error"}`);
            }
          } catch (error: any) {
            console.error(`[Templates] apt install error:`, error);
            broadcastProgress(`Warning: apt install error - ${error.message}`);
          }
        }
      }

      broadcastProgress("Template applied successfully!");

      res.json({
        success: true,
        template: {
          id: template.id,
          name: template.name,
        },
        filesCreated: createdFiles.length,
        devCommand: template.devCommand,
        buildCommand: template.buildCommand,
      });
    } catch (error: any) {
      console.error("[Templates] Apply error:", error);
      res.status(500).json({ 
        errorCode: "INTERNAL_ERROR",
        error: error.message 
      });
    }
  });

  // ========================================
  // GitHub & Git Routes
  // ========================================

  // GET /api/github/user - Get authenticated GitHub user
  app.get("/api/github/user", async (_req, res) => {
    try {
      const user = await github.getAuthenticatedUser();
      res.json(user);
    } catch (error: any) {
      console.error("[GitHub] User fetch error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/github/repos - List user repositories
  app.get("/api/github/repos", async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const perPage = parseInt(req.query.per_page as string) || 30;
      const repos = await github.listUserRepos(page, perPage);
      res.json(repos);
    } catch (error: any) {
      console.error("[GitHub] Repos fetch error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/github/repos/:owner/:repo - Get repository details
  app.get("/api/github/repos/:owner/:repo", async (req, res) => {
    try {
      const { owner, repo } = req.params;
      const repository = await github.getRepository(owner, repo);
      res.json(repository);
    } catch (error: any) {
      console.error("[GitHub] Repo fetch error:", error);
      res.status(404).json({ error: error.message });
    }
  });

  // POST /api/workspaces/:id/git/clone - Clone repository
  app.post("/api/workspaces/:id/git/clone", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const { repoUrl, branch } = req.body;

      if (!repoUrl) {
        return res.status(400).json({ error: "Repository URL is required" });
      }

      console.log(`[Git] Cloning repository: ${repoUrl}`);
      const result = await git.cloneRepository(repoUrl, workspaceId, branch);

      if (result.success) {
        // Invalidate file cache to show new files
        res.json({
          success: true,
          message: "Repository cloned successfully",
          output: result.output,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || "Clone failed",
          output: result.output,
        });
      }
    } catch (error: any) {
      console.error("[Git] Clone error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/workspaces/:id/git/status - Get Git status
  app.get("/api/workspaces/:id/git/status", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const status = await git.getGitStatus(workspaceId);

      if (status) {
        res.json(status);
      } else {
        res.status(404).json({ error: "Not a git repository" });
      }
    } catch (error: any) {
      console.error("[Git] Status error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/workspaces/:id/git/stage - Stage files
  app.post("/api/workspaces/:id/git/stage", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const { files = [] } = req.body;

      const result = await git.stageFiles(workspaceId, files);

      if (result.success) {
        res.json({ success: true, message: "Files staged successfully" });
      } else {
        res.status(400).json({ error: result.error || "Stage failed" });
      }
    } catch (error: any) {
      console.error("[Git] Stage error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/workspaces/:id/git/commit - Commit changes
  app.post("/api/workspaces/:id/git/commit", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const { message, author } = req.body;

      if (!message) {
        return res.status(400).json({ error: "Commit message is required" });
      }

      const result = await git.commit(workspaceId, message, author);

      if (result.success) {
        res.json({ success: true, message: "Changes committed successfully", output: result.output });
      } else {
        res.status(400).json({ error: result.error || "Commit failed" });
      }
    } catch (error: any) {
      console.error("[Git] Commit error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/workspaces/:id/git/push - Push commits
  app.post("/api/workspaces/:id/git/push", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const { remote = "origin", branch } = req.body;

      const result = await git.push(workspaceId, remote, branch);

      if (result.success) {
        res.json({ success: true, message: "Changes pushed successfully", output: result.output });
      } else {
        res.status(400).json({ error: result.error || "Push failed", output: result.output });
      }
    } catch (error: any) {
      console.error("[Git] Push error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/workspaces/:id/git/pull - Pull changes
  app.post("/api/workspaces/:id/git/pull", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const { remote = "origin", branch } = req.body;

      const result = await git.pull(workspaceId, remote, branch);

      if (result.success) {
        res.json({ success: true, message: "Changes pulled successfully", output: result.output });
      } else {
        res.status(400).json({ error: result.error || "Pull failed", output: result.output });
      }
    } catch (error: any) {
      console.error("[Git] Pull error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/workspaces/:id/git/history - Get commit history
  app.get("/api/workspaces/:id/git/history", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const limit = parseInt(req.query.limit as string) || 10;

      const history = await git.getCommitHistory(workspaceId, limit);
      res.json(history);
    } catch (error: any) {
      console.error("[Git] History error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/workspaces/:id/git/init - Initialize repository
  app.post("/api/workspaces/:id/git/init", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const result = await git.initRepository(workspaceId);

      if (result.success) {
        res.json({ success: true, message: "Repository initialized successfully" });
      } else {
        res.status(400).json({ error: result.error || "Init failed" });
      }
    } catch (error: any) {
      console.error("[Git] Init error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/workspaces/:id/git/remote - Set remote URL
  app.post("/api/workspaces/:id/git/remote", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const { url, name = "origin" } = req.body;

      if (!url) {
        return res.status(400).json({ error: "Remote URL is required" });
      }

      const result = await git.setRemote(workspaceId, url, name);

      if (result.success) {
        res.json({ success: true, message: "Remote configured successfully" });
      } else {
        res.status(400).json({ error: result.error || "Set remote failed" });
      }
    } catch (error: any) {
      console.error("[Git] Set remote error:", error);
      res.status(500).json({ error: error.message });
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
