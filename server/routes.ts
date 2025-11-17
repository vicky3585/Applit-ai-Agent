import type { Express } from "express";
import { Router } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createProxyMiddleware, responseInterceptor } from "http-proxy-middleware";
import { storage } from "./storage-factory";
import { sandbox } from "./sandbox";
import OpenAI from "openai";
import { ENV_CONFIG, validateDockerAccess, validateDatabaseAccess, getServiceUrl } from "@shared/environment";
import { installPackageRequestSchema, triggerDeploymentSchema } from "@shared/schema";
import { authMiddleware } from "./auth-middleware";
import { createWorkspaceOwnershipMiddleware, createRequireWorkspaceAccess } from "./workspace-ownership-middleware";
import { templates, getTemplateById } from "./templates";
import * as github from "./github";
import * as git from "./git";
import { initializeYjsProvider } from "./yjs-provider";
import * as path from "path";
import { verifyAccessToken } from "./auth";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Initialize storage
  const storageInstance = await storage;
  
  // Create workspace ownership middleware
  const workspaceOwnership = createWorkspaceOwnershipMiddleware(storageInstance);
  const requireWorkspaceAccess = createRequireWorkspaceAccess(authMiddleware, workspaceOwnership);
  
  // Initialize Yjs provider for real-time collaborative editing (Phase 7)
  // Handles WebSocket upgrades on /yjs/* paths (separate from /ws)
  const yjsProvider = initializeYjsProvider(httpServer, storageInstance);
  console.log("[Phase 7] Yjs collaborative editing ENABLED (Week 1 Priority #1)");
  
  // WebSocket server for real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  
  // Store active WebSocket connections by workspace ID
  const connections = new Map<string, Set<WebSocket>>();
  
  // Store active WebSocket connections by user ID (for secure per-user events)
  const userWebSocketConnections = new Map<string, Set<WebSocket>>();

  wss.on("connection", (ws: WebSocket & { workspaceId?: string; userId?: string }) => {
    let workspaceId: string | null = null;
    let userId: string | null = null;
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
          
          // SECURITY: Authenticate user via JWT token with session validation
          const token = data.token;
          if (!token) {
            console.error("[WebSocket] Join rejected - no authentication token provided");
            ws.send(JSON.stringify({ type: "error", error: "Authentication required" }));
            ws.close();
            return;
          }
          
          let authenticatedUserId: string;
          try {
            // CRITICAL SECURITY: Use getUserFromToken to validate session exists in DB
            const { getUserFromToken } = await import("./auth");
            const userInfo = await getUserFromToken(token);
            if (!userInfo) {
              throw new Error("Session revoked or expired");
            }
            authenticatedUserId = userInfo.userId;
          } catch (error) {
            console.error("[WebSocket] Join rejected - invalid token or revoked session:", error);
            ws.send(JSON.stringify({ type: "error", error: "Invalid authentication token" }));
            ws.close();
            return;
          }
          
          // SECURITY: Validate workspace ownership before allowing join
          const workspace = await storageInstance.getWorkspace(wsId);
          if (!workspace) {
            console.warn(`[WebSocket] Workspace ${wsId} not found, rejecting join`);
            ws.send(JSON.stringify({ type: "error", error: "Workspace not found" }));
            ws.close();
            return;
          }
          
          if (workspace.userId !== authenticatedUserId) {
            console.warn(`[WebSocket] User ${authenticatedUserId} attempted to join workspace ${wsId} owned by ${workspace.userId}, rejecting`);
            ws.send(JSON.stringify({ type: "error", error: "Access denied" }));
            ws.close();
            return;
          }
          
          const uid = authenticatedUserId;
          
          workspaceId = wsId;
          userId = uid;
          ws.workspaceId = wsId;
          ws.userId = uid;
          hasJoined = true;
          clearTimeout(joinTimeout);
          
          // Track by workspaceId
          if (!connections.has(wsId)) {
            connections.set(wsId, new Set());
          }
          connections.get(wsId)!.add(ws);
          
          // Track by userId (for secure workspace events)
          if (!userWebSocketConnections.has(uid)) {
            userWebSocketConnections.set(uid, new Set());
          }
          userWebSocketConnections.get(uid)!.add(ws);
          
          console.log(`[WebSocket] User ${uid} joined workspace ${wsId}`);
          
          // Send current state
          const execution = await storageInstance.getAgentExecution(wsId);
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
          await storageInstance.createChatMessage(
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
      
      // Clean up workspace connections
      if (workspaceId && connections.has(workspaceId)) {
        connections.get(workspaceId)!.delete(ws);
      }
      
      // Clean up user connections
      if (userId && userWebSocketConnections.has(userId)) {
        userWebSocketConnections.get(userId)!.delete(ws);
      }
      
      console.log(`[WebSocket] User ${userId} disconnected from workspace ${workspaceId}`);
    });
  });

  async function processAgentRequest(
    workspaceId: string,
    userMessage: string,
    clients?: Set<WebSocket>
  ) {
    try {
      // Get workspace context
      const files = await storageInstance.getFilesByWorkspace(workspaceId);
      const settings = await storageInstance.getWorkspaceSettings(workspaceId);
      
      // Import and create orchestrator
      const { AgentOrchestrator } = await import("./agents/orchestrator");
      const { createAIClient } = await import("./utils/ai-client");
      const orchestrator = new AgentOrchestrator(storage);

      // Respect workspace model provider setting (UI selector)
      // Map UI values: "openai" → openai, "local" → vllm, "anthropic" → openai (for now)
      let forceProvider: "openai" | "vllm" | undefined = undefined;
      if (settings?.modelProvider === "local") {
        forceProvider = "vllm"; // User explicitly selected Local vLLM
      } else if (settings?.modelProvider === "openai") {
        forceProvider = "openai"; // User explicitly selected OpenAI
      }
      // If no setting or "anthropic", use environment default (hybrid mode)

      // Create agent context (max attempts will be read from settings inside orchestrator)
      // Use ASYNC version to properly check vLLM health before creating client
      const context = {
        workspaceId,
        prompt: userMessage,
        existingFiles: files,
        settings: settings || null,
        openai: await createAIClient(forceProvider ? { forceProvider } : undefined),
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
        
        await storageInstance.createChatMessage(
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
        
        await storageInstance.createChatMessage(
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
      
      await storageInstance.createOrUpdateAgentExecution(workspaceId, {
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

  // Broadcast to specific user's connections only (secure per-user events)
  function broadcastToUser(userId: string, message: any) {
    const userConnections = userWebSocketConnections.get(userId);
    userConnections?.forEach((client) => {
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
  
  // GET /api/auth/me - Get currently authenticated user
  // Uses authMiddleware to support both header and cookie authentication
  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    try {
      // User is already authenticated and attached by authMiddleware
      // req.user contains {userId, username} from token
      // Return user data directly (password not included in req.user)
      res.json({
        id: req.user!.userId,
        username: req.user!.username,
        email: req.user!.email || null, // Email may not be in token payload
      });
    } catch (error: any) {
      console.error("[Auth] Get user error:", error);
      res.status(500).json({ error: error.message || "Failed to get user" });
    }
  });

  // GET /api/auth/ws-token - Get WebSocket authentication token
  app.get("/api/auth/ws-token", async (req, res) => {
    try {
      // Get access token from cookie
      const accessToken = req.cookies?.accessToken;
      
      if (!accessToken) {
        return res.status(401).json({ error: "Not authenticated" });
      }
      
      // CRITICAL SECURITY: Verify access token AND validate session exists in DB
      const { getUserFromToken, signAccessToken, verifyAccessToken } = await import("./auth");
      const userInfo = await getUserFromToken(accessToken);
      if (!userInfo) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }
      
      // Get full user object from database
      const user = await storageInstance.getUser(userInfo.userId);
      if (!user) {
        return res.status(401).json({ error: "User not found" });
      }
      
      // Get sessionId from original token for new token generation
      let payload;
      try {
        payload = verifyAccessToken(accessToken);
      } catch (error) {
        return res.status(401).json({ error: "Invalid token" });
      }
      
      // Generate short-lived JWT token for WebSocket authentication
      const token = signAccessToken(user, payload.sessionId);
      
      res.json({ token });
    } catch (error: any) {
      console.error("[Auth] WS token error:", error);
      res.status(500).json({ error: error.message || "Failed to generate token" });
    }
  });

  // POST /api/auth/signup - Create new user account
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { registerSchema } = await import("@shared/schema");
      const validatedData = registerSchema.parse(req.body);
      
      // Check if username already exists
      const existingUser = await storageInstance.getUserByUsername(validatedData.username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already taken" });
      }
      
      // Check if email already exists
      const existingEmail = await storageInstance.getUserByEmail(validatedData.email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already registered" });
      }
      
      // Hash password and create user
      const { hashPassword } = await import("./auth");
      const passwordHash = await hashPassword(validatedData.password);
      
      const newUser = await storageInstance.createUser({
        username: validatedData.username,
        email: validatedData.email,
        password: passwordHash,
      });
      
      console.log(`[Auth] User registered: ${newUser.username} (${newUser.id})`);
      
      // Return user data (without password hash)
      res.status(201).json({
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
      });
    } catch (error: any) {
      console.error("[Auth] Signup error:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0]?.message || "Validation failed" });
      }
      res.status(500).json({ error: error.message || "Signup failed" });
    }
  });

  // POST /api/auth/login - Login with username/password
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { loginSchema } = await import("@shared/schema");
      const validatedData = loginSchema.parse(req.body);
      
      // Find user by username
      const user = await storageInstance.getUserByUsername(validatedData.username);
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }
      
      // Verify password
      const { verifyPassword, signAccessToken, signRefreshToken, generateRefreshToken, hashRefreshToken } = await import("./auth");
      const isPasswordValid = await verifyPassword(validatedData.password, user.password);
      if (!isPasswordValid) {
        // TODO: Increment failed login count and implement account lockout
        return res.status(401).json({ error: "Invalid username or password" });
      }
      
      // Generate refresh token and create session
      const refreshToken = generateRefreshToken();
      const refreshTokenHash = await hashRefreshToken(refreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      const session = await storageInstance.createSession({
        userId: user.id,
        refreshTokenHash,
        expiresAt,
        userAgent: req.headers["user-agent"] || null,
        ipAddress: req.ip || null,
      });
      
      // Generate JWT access token with sessionId for session validation
      const accessToken = signAccessToken(user, session.id);
      const refreshTokenJWT = signRefreshToken(user.id, session.id);
      
      // Update last login timestamp
      await storageInstance.updateUserLastLogin(user.id);
      
      console.log(`[Auth] User logged in: ${user.username} (${user.id})`);
      
      // Set httpOnly cookies for security
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000, // 15 minutes
      });
      
      res.cookie("refreshToken", refreshTokenJWT, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      
      // Return user data
      res.json({
        id: user.id,
        username: user.username,
        email: user.email,
      });
    } catch (error: any) {
      console.error("[Auth] Login error:", error);
      if (error.name === "ZodError") {
        return res.status(400).json({ error: error.errors[0]?.message || "Validation failed" });
      }
      res.status(500).json({ error: error.message || "Login failed" });
    }
  });

  // POST /api/auth/logout - Logout and destroy session
  app.post("/api/auth/logout", async (req, res) => {
    try {
      // Get refresh token from cookie to revoke session
      const refreshToken = req.cookies?.refreshToken;
      
      if (refreshToken) {
        try {
          const { verifyRefreshTokenJWT } = await import("./auth");
          const payload = verifyRefreshTokenJWT(refreshToken);
          
          // Revoke session in database
          await storageInstance.deleteSession(payload.sessionId);
          console.log(`[Auth] Revoked session ${payload.sessionId} for user ${payload.userId}`);
        } catch (error) {
          // Token invalid or expired - continue with cookie clearing
          console.warn("[Auth] Could not revoke session (token invalid):", error);
        }
      }
      
      // Clear cookies with same options as when they were set
      const cookieOptions = {
        httpOnly: true,
        secure: req.secure || req.get('x-forwarded-proto') === 'https',
        sameSite: 'lax' as const,
        path: '/',
      };
      res.clearCookie("accessToken", cookieOptions);
      res.clearCookie("refreshToken", cookieOptions);
      
      res.json({ message: "Logged out successfully" });
    } catch (error: any) {
      console.error("[Auth] Logout error:", error);
      res.status(500).json({ error: error.message || "Logout failed" });
    }
  });

  // ========================================
  // Multi-Project Management (Task V1-7)
  // ========================================

  // GET /api/workspaces - List all workspaces for current user
  app.get("/api/workspaces", async (req, res) => {
    try {
      const { getAuthenticatedUserId } = await import("./get-auth-user");
      const userId = await getAuthenticatedUserId(req);
      const workspaces = await storageInstance.getWorkspacesByUserId(userId);
      res.json(workspaces);
    } catch (error: any) {
      if (error.message === "Not authenticated" || error.message === "Invalid or expired session") {
        return res.status(401).json({ error: error.message });
      }
      console.error("[Workspaces] List error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/workspaces - Create new workspace
  app.post("/api/workspaces", async (req, res) => {
    try {
      const { name } = req.body;
      
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "Workspace name is required" });
      }

      const { getAuthenticatedUserId } = await import("./get-auth-user");
      const userId = await getAuthenticatedUserId(req);
      
      const workspace = await storageInstance.createWorkspace(name.trim(), userId);
      console.log(`[Workspaces] Created workspace: ${workspace.id} (${workspace.name}) for user ${userId}`);
      
      res.status(201).json(workspace);
    } catch (error: any) {
      if (error.message === "Not authenticated" || error.message === "Invalid or expired session") {
        return res.status(401).json({ error: error.message });
      }
      console.error("[Workspaces] Create error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/workspaces/:id - Delete workspace
  app.delete("/api/workspaces/:id", async (req, res) => {
    try {
      const workspaceId = req.params.id;
      
      // Verify workspace exists
      const workspace = await storageInstance.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }

      // Verify user owns this workspace
      const { getAuthenticatedUserId } = await import("./get-auth-user");
      const userId = await getAuthenticatedUserId(req);
      
      if (workspace.userId !== userId) {
        return res.status(403).json({ 
          error: "Forbidden: You do not have permission to delete this workspace" 
        });
      }
      
      await storageInstance.deleteWorkspace(workspaceId);
      console.log(`[Workspaces] Deleted workspace: ${workspaceId} (${workspace.name}) for user ${userId}`);
      
      // Broadcast workspace deletion event ONLY to workspace owner
      broadcastToUser(workspace.userId, {
        type: "workspace.deleted",
        payload: { workspaceId, workspaceName: workspace.name },
      });
      
      res.json({ success: true, message: "Workspace deleted successfully" });
    } catch (error: any) {
      if (error.message === "Not authenticated" || error.message === "Invalid or expired session") {
        return res.status(401).json({ error: error.message });
      }
      console.error("[Workspaces] Delete error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/workspaces/:id/deploy - Deploy workspace as static app
  app.post("/api/workspaces/:id/deploy", authMiddleware, async (req: any, res) => {
    try {
      const workspaceId = req.params.id;
      
      // Validate request body
      const validation = triggerDeploymentSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Invalid request body",
          details: validation.error.issues 
        });
      }
      
      const { buildCommand } = validation.data;
      
      // Verify workspace exists
      const workspace = await storageInstance.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }

      // Verify user owns this workspace
      if (workspace.userId !== req.user.userId) {
        return res.status(403).json({ 
          error: "Forbidden: You do not have permission to deploy this workspace" 
        });
      }
      
      // Create deployment record with pending status
      const deployment = await storageInstance.createDeployment(
        workspaceId,
        "pending",
        buildCommand
      );
      
      console.log(`[Deployment] Created deployment ${deployment.id} for workspace ${workspaceId}`);
      
      // TODO: Invoke build executor to:
      // 1. Detect project type (package.json, vite.config, static HTML)
      // 2. Run appropriate build command (npm run build, etc.)
      // 3. Capture build logs to deployment.buildLogs
      // 4. Copy artifacts to /var/www/ai-ide/<workspaceId>/<timestamp>
      // 5. Atomic symlink swap to current
      // 6. Update deployment status to 'success' or 'failed'
      // 7. Set deployment.url to /apps/<workspaceId>/
      //
      // Build executor implementation deferred - see docs/DEPLOYMENT_GUIDE.md
      
      // For now, return pending deployment
      res.status(201).json({
        deployment,
        message: "Deployment initiated (build executor not yet implemented)"
      });
      
    } catch (error: any) {
      console.error("[Deployment] Deploy error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/workspaces/:id/deployments - List deployments for workspace
  app.get("/api/workspaces/:id/deployments", authMiddleware, async (req: any, res) => {
    try {
      const workspaceId = req.params.id;
      
      // Verify workspace exists
      const workspace = await storageInstance.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      
      // Verify user owns this workspace
      if (workspace.userId !== req.user.userId) {
        return res.status(403).json({ 
          error: "Forbidden: You do not have permission to view deployments for this workspace" 
        });
      }
      
      const deployments = await storageInstance.getDeployments(workspaceId);
      res.json(deployments);
    } catch (error: any) {
      console.error("[Deployment] List error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ========================================
  // Workspace Operations
  // ========================================

  app.get("/api/workspaces/:id", ...requireWorkspaceAccess, async (req, res) => {
    // Workspace ownership already verified by middleware
    res.json(req.workspace);
  });

  app.get("/api/workspaces/:id/files", ...requireWorkspaceAccess, async (req, res) => {
    const files = await storageInstance.getFilesByWorkspace(req.params.id);
    res.json(files);
  });

  // Task 6b: Get file version history for diff viewer
  app.get("/api/workspaces/:id/file-history", ...requireWorkspaceAccess, async (req, res) => {
    const { path, limit, skipLatest } = req.query;
    
    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: "File path is required" });
    }
    
    try {
      const parsedLimit = limit ? parseInt(limit as string) : undefined;
      const shouldSkipLatest = skipLatest === 'true';
      
      // Fetch one extra if we need to skip the latest
      const fetchLimit = shouldSkipLatest && parsedLimit ? parsedLimit + 1 : parsedLimit;
      const history = await storageInstance.getFileHistory(req.params.id, path, fetchLimit);
      
      // Skip the most recent snapshot if requested (to get the actual previous version)
      const filteredHistory = shouldSkipLatest && history.length > 0 ? history.slice(1) : history;
      
      res.json(filteredHistory);
    } catch (error: any) {
      console.error("[FileHistory] Failed to get file history:", error);
      res.status(500).json({ error: "Failed to retrieve file history" });
    }
  });

  app.post("/api/workspaces/:id/files", ...requireWorkspaceAccess, async (req, res) => {
    const { path, content, language } = req.body;
    const file = await storageInstance.createFile(
      req.params.id,
      path,
      content,
      language
    );
    
    // Task 6a: No snapshot needed for create - the file itself is the initial version
    // Snapshots are only captured for updates and deletions to track changes
    
    res.json(file);
  });

  app.put("/api/files/:id", authMiddleware, async (req: any, res) => {
    const file = await storageInstance.getFile(req.params.id);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const workspace = await storageInstance.getWorkspace(file.workspaceId);
    if (!workspace || workspace.userId !== req.user.userId) {
      return res.status(403).json({ error: "Access denied: file belongs to another user's workspace" });
    }
    
    const { content } = req.body;
    
    // Task 6a: Record file snapshot before updating (for diff viewer)
    try {
      await storageInstance.recordFileSnapshot(
        file.workspaceId,
        file.path,
        file.content,
        "update"
      );
    } catch (error) {
      console.error("[FileHistory] Failed to record snapshot:", error);
    }
    
    const updatedFile = await storageInstance.updateFile(req.params.id, content);
    res.json(updatedFile);
  });

  app.patch("/api/files/:id/rename", authMiddleware, async (req: any, res) => {
    const file = await storageInstance.getFile(req.params.id);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const workspace = await storageInstance.getWorkspace(file.workspaceId);
    if (!workspace || workspace.userId !== req.user.userId) {
      return res.status(403).json({ error: "Access denied: file belongs to another user's workspace" });
    }
    
    const { newPath } = req.body;
    if (!newPath) {
      return res.status(400).json({ error: "newPath is required" });
    }
    
    try {
      const renamedFile = await storageInstance.renameFile(req.params.id, newPath);
      res.json(renamedFile);
    } catch (error: any) {
      if (error.message === "A file already exists at the target path") {
        return res.status(409).json({ error: error.message });
      }
      throw error;
    }
  });

  app.delete("/api/files/:id", authMiddleware, async (req: any, res) => {
    const file = await storageInstance.getFile(req.params.id);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const workspace = await storageInstance.getWorkspace(file.workspaceId);
    if (!workspace || workspace.userId !== req.user.userId) {
      return res.status(403).json({ error: "Access denied: file belongs to another user's workspace" });
    }
    
    // Task 6a: Record final snapshot before deletion (for diff viewer)
    try {
      await storageInstance.recordFileSnapshot(
        file.workspaceId,
        file.path,
        file.content,
        "delete"
      );
    } catch (error) {
      console.error("[FileHistory] Failed to record deletion snapshot:", error);
    }
    
    await storageInstance.deleteFile(req.params.id);
    res.json({ success: true });
  });

  app.get("/api/workspaces/:id/chat", ...requireWorkspaceAccess, async (req, res) => {
    const messages = await storageInstance.getChatMessages(req.params.id);
    res.json(messages);
  });

  app.get("/api/workspaces/:id/settings", ...requireWorkspaceAccess, async (req, res) => {
    const settings = await storageInstance.getWorkspaceSettings(req.params.id);
    res.json(settings || {});
  });

  app.put("/api/workspaces/:id/settings", ...requireWorkspaceAccess, async (req, res) => {
    const settings = await storageInstance.upsertWorkspaceSettings(req.params.id, req.body);
    res.json(settings);
  });

  app.get("/api/workspaces/:id/api-key-status", ...requireWorkspaceAccess, async (req, res) => {
    res.json({ 
      configured: !!process.env.OPENAI_API_KEY,
      keyType: process.env.OPENAI_API_KEY?.startsWith('sk-') ? 'valid' : 'invalid'
    });
  });

  app.get("/api/workspaces/:id/preview-url", ...requireWorkspaceAccess, async (req, res) => {
    // Task 5: Detect Dev Server and Route Preview Automatically
    // Return the preview URL for the workspace
    const workspaceId = req.params.id;
    
    // Force HTTPS when X-Forwarded-Proto is https or when host contains replit.dev
    const host = req.get('host') || '';
    const forwardedProto = req.get('x-forwarded-proto');
    const isSecure = forwardedProto === 'https' || host.includes('replit.dev') || req.secure;
    const protocol = isSecure ? 'https' : req.protocol;
    const baseUrl = `${protocol}://${host}`;
    
    // STEP 1: Check if dev server is running (highest priority)
    try {
      const { getDevServerManager } = await import("./dev-server-manager");
      const { ENV_CONFIG } = await import("@shared/environment");
      const manager = getDevServerManager();
      const devServer = manager.getServer(workspaceId);
      
      if (devServer && devServer.url) {
        // On Ubuntu/local: Return network-accessible URL (use same host as main app, different port)
        // On Replit: Return proxy URL (for same-origin policy)
        let previewUrl: string;
        
        if (ENV_CONFIG.env === "local") {
          // Extract hostname from the request (e.g., 192.168.31.138 or localhost)
          const hostname = host.split(':')[0]; // Remove port from host
          previewUrl = `http://${hostname}:${devServer.port}`;
        } else {
          // Replit: use proxy
          previewUrl = `${baseUrl}/preview/${workspaceId}/`;
        }
        
        console.log(`[Preview URL] Dev server detected (${devServer.type} on ${ENV_CONFIG.env}), returning: ${previewUrl}`);
        return res.json({ 
          url: previewUrl,
          hasDevServer: true,
          devServerType: devServer.type,
          devServerPort: devServer.port,
        });
      }
    } catch (error: any) {
      console.log(`[Preview URL] Dev server check failed:`, error.message);
    }
    
    // STEP 2: Fall back to HTML file detection (original behavior)
    const files = await storageInstance.getFilesByWorkspace(workspaceId);
    
    // Look for HTML files
    const htmlFiles = files.filter(f => 
      f.path.endsWith('.html') || f.path.endsWith('.htm')
    );
    
    // If there are HTML files, suggest the first one
    if (htmlFiles.length > 0) {
      const firstHtml = htmlFiles[0];
      res.json({ 
        url: `${baseUrl}/preview/${workspaceId}/${firstHtml.path}`,
        hasHtmlFiles: true,
        hasDevServer: false,
        htmlFiles: htmlFiles.map(f => ({
          path: f.path,
          url: `${baseUrl}/preview/${workspaceId}/${f.path}`
        }))
      });
    } else {
      res.json({ 
        url: baseUrl, 
        hasHtmlFiles: false,
        hasDevServer: false,
      });
    }
  });

  // Get dev server status for a workspace
  app.get("/api/workspaces/:id/dev-server/status", ...requireWorkspaceAccess, async (req, res) => {
    const workspaceId = req.params.id;
    
    try {
      const { getDevServerManager } = await import("./dev-server-manager");
      const manager = getDevServerManager();
      const server = manager.getServer(workspaceId);
      
      if (server) {
        res.json({
          running: true,
          status: server.status,
          type: server.type,
          port: server.port,
          url: server.url,
          startedAt: server.startedAt,
          lastHealthCheck: server.lastHealthCheck,
          healthCheckFails: server.healthCheckFails,
        });
      } else {
        res.json({
          running: false,
          status: "stopped",
        });
      }
    } catch (error: any) {
      console.error(`[DevServer] Error getting server status:`, error);
      res.status(500).json({ error: "Failed to get server status" });
    }
  });

  // Export workspace as ZIP file
  app.get("/api/workspaces/:id/export", ...requireWorkspaceAccess, async (req, res) => {
    const workspaceId = req.params.id;
    
    try {
      const archiver = (await import("archiver")).default;
      
      // Get all files for the workspace
      const files = await storageInstance.getFilesByWorkspace(workspaceId);
      
      if (files.length === 0) {
        return res.status(404).json({ error: "No files to export" });
      }
      
      // Set response headers for ZIP download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="workspace-${workspaceId}.zip"`);
      
      // Create archiver instance
      const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
      });
      
      // Handle archiver errors
      archive.on('error', (err) => {
        console.error('[Export] Archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to create ZIP archive' });
        }
      });
      
      // Pipe archive data to response
      archive.pipe(res);
      
      // Add each file to the archive
      for (const file of files) {
        archive.append(file.content, { name: file.path });
      }
      
      // Finalize the archive (no more files will be added)
      await archive.finalize();
      
      console.log(`[Export] Exported ${files.length} files for workspace ${workspaceId}`);
    } catch (error: any) {
      console.error(`[Export] Error exporting workspace:`, error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to export workspace" });
      }
    }
  });

  // Task 4: Dev Server Proxy - Only proxy when dev server exists
  // Fix 2: Only create and invoke proxy when dev server is running
  app.use("/preview/:workspaceId", async (req: any, res: any, next: any) => {
    try {
      const workspaceId = req.params.workspaceId;
      const { getDevServerManager } = await import("./dev-server-manager");
      const manager = getDevServerManager();
      const devServer = manager.getServer(workspaceId);
      
      // If no dev server, skip to static file handler
      if (!devServer || !devServer.url) {
        return next();
      }
      
      // Dev server exists - create proxy and invoke it (this terminates the request)
      const proxy = createProxyMiddleware({
        target: devServer.url,
        changeOrigin: true,
        ws: true, // WebSocket support for HMR
        selfHandleResponse: true, // Required for response interception
        pathRewrite: (path) => {
          // Remove /preview/:workspaceId prefix, ensure we always return at least '/'
          const rewritten = path.replace(`/preview/${workspaceId}`, '') || '/';
          return rewritten;
        },
        on: {
          proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, res) => {
            // Strip Vite HMR client from HTML responses to prevent iframe rendering issues
            const contentType = proxyRes.headers['content-type'] || '';
            if (contentType.includes('text/html')) {
              const html = responseBuffer.toString('utf8');
              // Remove Vite client script injection (causes iframe rendering to fail)
              const cleanedHtml = html.replace(
                /<script type="module" src="\/@vite\/client"><\/script>\s*/g,
                ''
              );
              return cleanedHtml;
            }
            // Return other content types unchanged
            return responseBuffer;
          }),
          error: (err, _req, _res) => {
            console.error('[Preview Proxy] Error:', err.message);
          },
        },
      });
      
      // Invoke proxy - execution stops here
      proxy(req, res, next);
    } catch (error: any) {
      console.error('[Preview Guard] Error:', error.message);
      // On error, continue to static file handler
      next();
    }
  });

  // Serve workspace files for preview (HTML, CSS, JS, etc.) - FALLBACK
  app.get("/preview/:workspaceId/*", async (req, res) => {
    try {
      const workspaceId = req.params.workspaceId;
      const filePath = (req.params as any)[0]; // Everything after /preview/:workspaceId/
      
      if (!filePath) {
        return res.status(400).send("File path required");
      }

      // Get all files in workspace
      const files = await storageInstance.getFilesByWorkspace(workspaceId);
      
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

  app.post("/api/workspaces/:id/start-server", ...requireWorkspaceAccess, async (req, res) => {
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

      // Get workspace path using FilePersistence helper (ensures directory exists)
      const workspacePath = await persistence.resolveWorkspacePath(workspaceId);
      
      if (!workspacePath) {
        return res.status(400).json({ error: "Failed to resolve workspace directory" });
      }

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

  app.post("/api/workspaces/:id/stop-server", ...requireWorkspaceAccess, async (req, res) => {
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

  app.get("/api/workspaces/:id/agent", ...requireWorkspaceAccess, async (req, res) => {
    const execution = await storageInstance.getAgentExecution(req.params.id);
    res.json(execution || { status: "idle" });
  });

  // AI Agent - Status endpoint for polling
  app.get("/api/workspaces/:id/agent/status", ...requireWorkspaceAccess, async (req, res) => {
    try {
      const execution = await storageInstance.getAgentExecution(req.params.id);
      
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
  app.get("/api/workspaces/:id/agent/result", ...requireWorkspaceAccess, async (req, res) => {
    try {
      const execution = await storageInstance.getAgentExecution(req.params.id);
      
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
  app.post("/api/workspaces/:id/agent/generate", ...requireWorkspaceAccess, async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const workspaceId = req.params.id;
    
    // Create initial execution record
    const execution = await storageInstance.createOrUpdateAgentExecution(workspaceId, {
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
          const files = await storageInstance.getFilesByWorkspace(workspaceId);
          
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
          
          // Initialize result fields defensively
          result.logs = result.logs || [];
          result.files_generated = result.files_generated || [];
          result.errors = result.errors || [];
          
          // Save generated files to workspace
          if (result.files_generated && result.files_generated.length > 0) {
            for (const file of result.files_generated) {
              await storageInstance.createFile(
                workspaceId,
                file.path,
                file.content,
                file.language || "plaintext"
              );
            }
            
            // 🎯 AUTO PACKAGE INSTALLATION - Phase 1 Feature
            // Only install packages if files were generated
            try {
              const { autoInstallPackages } = await import("./package-installer");
              const workspaceDir = path.join("/tmp/ide-workspaces", workspaceId);
              
              const installResult = await autoInstallPackages(
                result.files_generated,
                workspaceDir,
                (message) => {
                  // Broadcast progress to clients
                  wss.clients.forEach((client: any) => {
                    if (client.readyState === 1 && client.workspaceId === workspaceId) {
                      client.send(JSON.stringify({
                        type: "package-install-progress",
                        data: { message },
                      }));
                    }
                  });
                }
              );
              
              // Append installation logs to result
              result.logs = [...(result.logs || []), ...installResult.logs];
              
              // Broadcast installation complete
              if (installResult.success && installResult.packagesInstalled.length > 0) {
                wss.clients.forEach((client: any) => {
                  if (client.readyState === 1 && client.workspaceId === workspaceId) {
                    client.send(JSON.stringify({
                      type: "packages-installed",
                      data: { 
                        packages: installResult.packagesInstalled,
                        count: installResult.packagesInstalled.length 
                      },
                    }));
                  }
                });
              }
            } catch (installError: any) {
              console.error("[Package Installer] Error:", installError);
              result.logs = [...(result.logs || []), `Package installation error: ${installError.message}`];
            }
          }
          
          // NOTE: Dev server spawning is now handled by the orchestrator AFTER package installation
          // This ensures packages are installed before trying to start the dev server
          // (Removed legacy auto dev server code that was causing premature server start)

          // Update execution with result
          // IMPORTANT: Manage failure state persistence
          const finalStatus = result.status || "complete";
          const isFailed = finalStatus === "failed";
          const finalErrors = isFailed ? (result.errors || []) : [];
          
          // Fetch previous execution to preserve last_failed_step during processing
          const previousExecution = await storageInstance.getAgentExecution(workspaceId);
          
          // Determine last_failed_step
          let lastFailedStep: string | null | undefined = undefined;
          if (isFailed) {
            // Capture which step failed for timeline persistence
            const currentStep = result.current_step || "planning";
            if (currentStep === "fixing") {
              lastFailedStep = "testing"; // Fixing happens after testing fails
            } else if (["planning", "coding", "testing"].includes(currentStep)) {
              lastFailedStep = currentStep;
            } else {
              lastFailedStep = "planning"; // Fallback
            }
          } else if (finalStatus === "complete") {
            // Clear failure state on successful completion
            lastFailedStep = null;
          } else {
            // For processing/idle states, preserve existing last_failed_step from DB
            lastFailedStep = previousExecution?.last_failed_step ?? null;
          }
          
          const executionUpdate: any = {
            prompt,
            status: finalStatus,
            current_step: result.current_step || finalStatus, // Use orchestrator's step
            progress: result.progress ?? (finalStatus === "complete" ? 1.0 : (previousExecution?.progress ?? 0)),
            logs: result.logs || [],
            files_generated: result.files_generated || [],
            errors: finalErrors,
            last_failed_step: lastFailedStep,
          };
          
          await storageInstance.createOrUpdateAgentExecution(workspaceId, executionUpdate);
          
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
        const { createAIClient } = await import("./utils/ai-client");
        
        const files = await storageInstance.getFilesByWorkspace(workspaceId);
        const settings = await storageInstance.getWorkspaceSettings(workspaceId) || null;
        
        // Respect workspace model provider setting (UI selector)
        // Map UI values: "openai" → openai, "local" → vllm, "anthropic" → openai (for now)
        let forceProvider: "openai" | "vllm" | undefined = undefined;
        if (settings?.modelProvider === "local") {
          forceProvider = "vllm"; // User explicitly selected Local vLLM
        } else if (settings?.modelProvider === "openai") {
          forceProvider = "openai"; // User explicitly selected OpenAI
        }
        // If no setting or "anthropic", use environment default (hybrid mode)
        
        // Use ASYNC version to properly check vLLM health before creating client
        const openai = await createAIClient(forceProvider ? { forceProvider } : undefined);
        
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
            await storageInstance.createOrUpdateAgentExecution(workspaceId, {
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
            // Fix: Stringify JSON objects (especially package.json)
            let content = file.content;
            if (typeof content === 'object' && content !== null) {
              content = JSON.stringify(content, null, 2);
              console.log(`[Routes] Stringified JSON object for ${file.path}`);
            }
            
            await storageInstance.createFile(
              workspaceId,
              file.path,
              content,
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
        await storageInstance.createOrUpdateAgentExecution(workspaceId, {
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
  app.post("/api/workspaces/:id/terminal/execute", ...requireWorkspaceAccess, async (req, res) => {
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
  app.get("/api/workspaces/:id/executions", ...requireWorkspaceAccess, async (req, res) => {
    try {
      const executions = await storageInstance.getCodeExecutions(req.params.id);
      res.json(executions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/workspaces/:id/executions/:executionId - Get specific execution
  app.get("/api/workspaces/:id/executions/:executionId", ...requireWorkspaceAccess, async (req, res) => {
    try {
      const execution = await storageInstance.getCodeExecution(req.params.executionId);
      if (!execution) {
        return res.status(404).json({ error: "Execution not found" });
      }
      res.json(execution);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/workspaces/:id/files/:fileId/execute", ...requireWorkspaceAccess, async (req, res) => {
    const file = await storageInstance.getFile(req.params.fileId);
    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }
    
    try {
      // Create execution record
      const execution = await storageInstance.createCodeExecution(
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
            await storageInstance.appendCodeExecutionOutput(execution.id, accumulatedOutput);
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
            await storageInstance.updateCodeExecution(execution.id, {
              status: 'completed',
              error: result.error || null,
              exitCode: result.exitCode !== undefined && result.exitCode !== null ? String(result.exitCode) : null,
              completedAt: new Date(),
            });
            console.log(`[Execution] Updated execution record: ${execution.id}`);

            // Broadcast completion
            const updated = await storageInstance.getCodeExecution(execution.id);
            broadcastToWorkspace(req.params.id, {
              type: "execution_completed",
              data: updated,
            });
            console.log(`[Execution] Broadcast completion for ${file.path}`);
          } catch (error: any) {
            console.error("[Execution] Failed to complete execution:", error);
            // Mark as failed if flush/update fails
            await storageInstance.updateCodeExecution(execution.id, {
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
          await storageInstance.updateCodeExecution(execution.id, {
            status: 'failed',
            error: error.message,
            completedAt: new Date(),
          });

          // Broadcast error
          const updated = await storageInstance.getCodeExecution(execution.id);
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
  app.get("/api/workspaces/:id/packages", ...requireWorkspaceAccess, async (req, res) => {
    try {
      const packages = await storageInstance.getPackages(req.params.id);
      res.json(packages);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // POST /api/workspaces/:id/packages/install - Install package(s)
  app.post("/api/workspaces/:id/packages/install", ...requireWorkspaceAccess, async (req, res) => {
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
          const pkg = await storageInstance.upsertPackage(workspaceId, pkgName, version, packageManager);
          installedPackages.push(pkg);
        } catch (error) {
          console.error(`Failed to parse version for ${pkgName}:`, error);
          // Still save package even if version parsing fails
          const pkg = await storageInstance.upsertPackage(workspaceId, pkgName, null, packageManager);
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
  app.delete("/api/workspaces/:id/packages/:packageId", ...requireWorkspaceAccess, async (req, res) => {
    try {
      const workspaceId = req.params.id;
      const packageId = req.params.packageId;
      
      // Get package to delete
      const allPackages = await storageInstance.getPackages(workspaceId);
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
      await storageInstance.deletePackage(packageId);
      
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
  app.post("/api/workspaces/:id/apply-template", ...requireWorkspaceAccess, async (req, res) => {
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
        const file = await storageInstance.createFile(
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
                await storageInstance.upsertPackage(workspaceId, pkgName, null, "npm");
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
                await storageInstance.upsertPackage(workspaceId, pkgName, null, "pip");
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
                await storageInstance.upsertPackage(workspaceId, pkgName, null, "apt");
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

      // Sync all files to disk (required for preview and manual dev server start)
      try {
        const { getFilePersistence } = await import("./file-persistence");
        const persistence = getFilePersistence();
        
        broadcastProgress("Syncing files to disk...");
        for (const file of createdFiles) {
          await persistence.saveFile(workspaceId, file.path, file.content);
        }
        console.log(`[Templates] Synced ${createdFiles.length} files to disk`);
      } catch (error: any) {
        console.error("[Templates] File sync error:", error);
        broadcastProgress(`Warning: Could not sync files to disk - ${error.message}`);
      }

      // AUTO-START DEV SERVER (Task 2: Auto-Start Dev Server After Template Application)
      let devServerInfo = null;
      if (template.devCommand) {
        // Check if dev server auto-start is available (requires Docker/local environment)
        const { ENV_CONFIG } = await import("@shared/environment");
        
        if (!ENV_CONFIG.sandbox.available) {
          console.log("[Templates] Dev server auto-start unavailable (requires Docker/local environment)");
          broadcastProgress("Template ready - start dev server manually in Terminal");
        } else {
          try {
            const { getDevServerManager } = await import("./dev-server-manager");
            const { getFilePersistence } = await import("./file-persistence");
            
            const manager = getDevServerManager();
            const persistence = getFilePersistence();
            
            // Get workspace path using FilePersistence helper (ensures directory exists)
            const workspacePath = await persistence.resolveWorkspacePath(workspaceId);
            
            if (!workspacePath) {
              throw new Error("Failed to create workspace directory");
            }
            
            // Start dev server
            broadcastProgress("Starting dev server...");
            const server = await manager.startServer(workspaceId, workspacePath);
            
            if (server) {
              console.log(`[Templates] Dev server started on port ${server.port}`);
              broadcastProgress(`Dev server running on port ${server.port}`);
              devServerInfo = {
                port: server.port,
                url: server.url,
                type: server.type,
              };
            } else {
              console.log(`[Templates] Could not auto-start dev server`);
              broadcastProgress("Template ready - start dev server manually if needed");
            }
          } catch (error: any) {
            console.error("[Templates] Dev server start error:", error);
            broadcastProgress(`Warning: Could not start dev server - ${error.message}`);
          }
        }
      }

      res.json({
        success: true,
        template: {
          id: template.id,
          name: template.name,
        },
        filesCreated: createdFiles.length,
        devCommand: template.devCommand,
        buildCommand: template.buildCommand,
        devServer: devServerInfo,
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
  app.post("/api/workspaces/:id/git/clone", ...requireWorkspaceAccess, async (req, res) => {
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
  app.get("/api/workspaces/:id/git/status", ...requireWorkspaceAccess, async (req, res) => {
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
  app.post("/api/workspaces/:id/git/stage", ...requireWorkspaceAccess, async (req, res) => {
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
  app.post("/api/workspaces/:id/git/commit", ...requireWorkspaceAccess, async (req, res) => {
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
  app.post("/api/workspaces/:id/git/push", ...requireWorkspaceAccess, async (req, res) => {
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
  app.post("/api/workspaces/:id/git/pull", ...requireWorkspaceAccess, async (req, res) => {
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
  app.get("/api/workspaces/:id/git/history", ...requireWorkspaceAccess, async (req, res) => {
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
  app.post("/api/workspaces/:id/git/init", ...requireWorkspaceAccess, async (req, res) => {
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
  app.post("/api/workspaces/:id/git/remote", ...requireWorkspaceAccess, async (req, res) => {
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

  // ==================== Key-Value Store API (Week 1 Priority #3) ====================
  // Redis-backed KV store with in-memory fallback for development

  const kvStore = await import("./kv-store").then(m => m.kvStorePromise);

  // GET /api/workspaces/:id/kv - List all keys (with optional pattern)
  app.get("/api/workspaces/:id/kv", authMiddleware, async (req: any, res) => {
    try {
      const workspaceId = req.params.id;
      const userPattern = (req.query.pattern as string) || "*";
      
      // SECURITY: Validate workspace ownership
      const workspace = await storageInstance.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      if (workspace.userId !== req.user.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // SECURITY: Force workspace-scoped pattern to prevent cross-workspace access
      const safePattern = `workspace:${workspaceId}:${userPattern}`;
      
      const keys = await kvStore.keys(safePattern);
      
      // Get values for all keys and strip workspace prefix from key names
      const entries = await Promise.all(
        keys.map(async (key) => {
          const userKey = key.replace(`workspace:${workspaceId}:`, '');
          return {
            key: userKey,
            value: await kvStore.get(key),
            ttl: await kvStore.ttl(key),
          };
        })
      );
      
      res.json({ entries, count: entries.length });
    } catch (error: any) {
      console.error("[KV] List keys error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/workspaces/:id/kv/:key - Get value by key
  app.get("/api/workspaces/:id/kv/:key", authMiddleware, async (req: any, res) => {
    try {
      const workspaceId = req.params.id;
      const userKey = req.params.key;
      
      // SECURITY: Validate workspace ownership
      const workspace = await storageInstance.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      if (workspace.userId !== req.user.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // SECURITY: Validate key to prevent path traversal or namespace escape
      if (!userKey || userKey.includes('..') || userKey.startsWith('workspace:')) {
        return res.status(400).json({ error: "Invalid key format" });
      }
      
      const key = `workspace:${workspaceId}:${userKey}`;
      const value = await kvStore.get(key);
      
      if (value === null) {
        return res.status(404).json({ error: "Key not found" });
      }
      
      const ttl = await kvStore.ttl(key);
      res.json({ key: userKey, value, ttl });
    } catch (error: any) {
      console.error("[KV] Get error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/workspaces/:id/kv - Set key-value pair
  app.post("/api/workspaces/:id/kv", authMiddleware, async (req: any, res) => {
    try {
      const workspaceId = req.params.id;
      const { key: userKey, value, ttl } = req.body;
      
      // SECURITY: Validate workspace ownership
      const workspace = await storageInstance.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      if (workspace.userId !== req.user.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (!userKey || value === undefined) {
        return res.status(400).json({ error: "Key and value are required" });
      }
      
      // SECURITY: Validate key to prevent namespace escape
      if (userKey.includes('..') || userKey.startsWith('workspace:')) {
        return res.status(400).json({ error: "Invalid key format" });
      }
      
      // Validate TTL if provided
      if (ttl !== undefined && (typeof ttl !== 'number' || ttl < 0)) {
        return res.status(400).json({ error: "TTL must be a positive number" });
      }
      
      const key = `workspace:${workspaceId}:${userKey}`;
      await kvStore.set(key, String(value), ttl);
      
      res.json({ success: true, key: userKey, value });
    } catch (error: any) {
      console.error("[KV] Set error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/workspaces/:id/kv/:key - Delete key
  app.delete("/api/workspaces/:id/kv/:key", authMiddleware, async (req: any, res) => {
    try {
      const workspaceId = req.params.id;
      const userKey = req.params.key;
      
      // SECURITY: Validate workspace ownership
      const workspace = await storageInstance.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      if (workspace.userId !== req.user.userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // SECURITY: Validate key to prevent namespace escape
      if (!userKey || userKey.includes('..') || userKey.startsWith('workspace:')) {
        return res.status(400).json({ error: "Invalid key format" });
      }
      
      const key = `workspace:${workspaceId}:${userKey}`;
      await kvStore.delete(key);
      res.json({ success: true, key: userKey });
    } catch (error: any) {
      console.error("[KV] Delete error:", error);
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

  // Live preview proxy - DISABLED on local Ubuntu (uses dynamic per-workspace proxy instead)
  // The dynamic proxy at line 702 handles /preview/:workspaceId correctly
  if (ENV_CONFIG.env === "replit" && ENV_CONFIG.sandbox.mode === "docker") {
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

  // Register WebSocket upgrade handler for dynamic dev server previews
  httpServer.on("upgrade", async (req, socket, head) => {
    const url = req.url || "";
    
    // Handle dev server preview WebSocket upgrades (e.g., Vite HMR)
    const previewMatch = url.match(/^\/preview\/([^/]+)(\/.*)?/);
    if (previewMatch) {
      const workspaceId = previewMatch[1];
      const { getDevServerManager } = await import("./dev-server-manager");
      const manager = getDevServerManager();
      const devServer = manager.getServer(workspaceId);
      
      if (devServer && devServer.url) {
        console.log(`[Preview Proxy] Upgrading WebSocket for workspace ${workspaceId} to ${devServer.url}`);
        
        // Create a temporary proxy for this upgrade
        const wsProxy = createProxyMiddleware({
          target: devServer.url,
          changeOrigin: true,
          ws: true,
          pathRewrite: (path) => {
            return path.replace(`/preview/${workspaceId}`, '') || '/';
          },
        });
        
        // Perform the upgrade
        wsProxy.upgrade!(req, socket as any, head);
        return;
      }
    }
    
    // Handle static proxy WebSocket upgrades (code-server, sandbox preview)
    for (const { path, proxy } of proxies) {
      if (url.startsWith(path)) {
        console.log(`[Proxy] Upgrading WebSocket for ${path}`);
        proxy.upgrade!(req, socket as any, head);
        return;
      }
    }
    
    // No matching proxy - let the default WebSocket handler take over (Yjs, etc.)
    console.log(`[Proxy] No proxy matched for upgrade: ${url}`);
  });
  
  // Note: Yjs WebSocket upgrades are handled separately in yjs-provider.ts

  return httpServer;
}
