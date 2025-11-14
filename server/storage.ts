import { 
  type User, 
  type InsertUser,
  type Session,
  type InsertSession,
  type Workspace,
  type File,
  type ChatMessage,
  type AgentExecution,
  type Package,
  type InsertPackage,
  type CodeExecution,
  type WorkspaceSettings,
  type UpdateWorkspaceSettings,
  type YjsDocument,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { fileSync } from "./file-sync";

// Security configuration
const MAX_SESSIONS_PER_USER = parseInt(process.env.MAX_SESSIONS_PER_USER || "5");

export interface IStorage {
  // Initialization method
  initialize(): Promise<void>;
  
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  
  // Session methods
  createSession(session: InsertSession): Promise<Session>;
  getSessionByTokenHash(tokenHash: string): Promise<Session | undefined>;
  getSessionsByUserId(userId: string): Promise<Session[]>;
  deleteSession(id: string): Promise<void>;
  deleteUserSessions(userId: string): Promise<void>;
  rotateSession(oldSessionId: string, newSession: InsertSession): Promise<Session>;
  cleanupExpiredSessions(): Promise<number>; // Returns count of deleted sessions
  
  // Workspace methods
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByUserId(userId: string): Promise<Workspace[]>;
  createWorkspace(name: string, userId: string): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;
  
  // File methods
  getFile(id: string): Promise<File | undefined>;
  getFilesByWorkspace(workspaceId: string): Promise<File[]>;
  getFileByPath(workspaceId: string, path: string): Promise<File | undefined>;
  createFile(workspaceId: string, path: string, content: string, language?: string): Promise<File>;
  updateFile(id: string, content: string): Promise<File | undefined>;
  renameFile(id: string, newPath: string): Promise<File | undefined>;
  deleteFile(id: string): Promise<void>;
  
  // Chat methods
  getChatMessages(workspaceId: string): Promise<ChatMessage[]>;
  createChatMessage(workspaceId: string, role: string, content: string, metadata?: any): Promise<ChatMessage>;
  
  // Agent execution methods
  getAgentExecution(workspaceId: string): Promise<AgentExecution | undefined>;
  createOrUpdateAgentExecution(
    workspaceId: string,
    data: {
      prompt?: string;
      status: string;
      current_step: string;
      progress: number;
      attempt_count?: number;
      last_failed_step?: string | null;
      logs: any[];
      structuredLogs?: any[]; // Phase 2: Structured logs
      files_generated: any[];
      errors: any[];
    }
  ): Promise<AgentExecution>;
  
  // Package methods
  getPackages(workspaceId: string): Promise<Package[]>;
  upsertPackage(workspaceId: string, name: string, version: string | null, packageManager: string): Promise<Package>;
  deletePackage(id: string): Promise<void>;
  
  // Code execution methods
  getCodeExecution(id: string): Promise<CodeExecution | undefined>;
  getCodeExecutions(workspaceId: string): Promise<CodeExecution[]>;
  createCodeExecution(workspaceId: string, filePath: string, language?: string): Promise<CodeExecution>;
  updateCodeExecution(id: string, updates: Partial<Pick<CodeExecution, 'status' | 'output' | 'error' | 'exitCode' | 'completedAt'>>): Promise<CodeExecution | undefined>;
  appendCodeExecutionOutput(id: string, chunk: string): Promise<CodeExecution | undefined>;
  
  // Settings methods
  getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings | undefined>;
  upsertWorkspaceSettings(workspaceId: string, settings: UpdateWorkspaceSettings): Promise<WorkspaceSettings>;
  
  // Yjs document methods (Phase 7 - Multiplayer)
  getYjsDocument(workspaceId: string, docName: string): Promise<YjsDocument | undefined>;
  upsertYjsDocument(workspaceId: string, docName: string, state: string, stateVector: string): Promise<YjsDocument>;
  deleteYjsDocument(workspaceId: string, docName: string): Promise<void>;
  
  // Deployment methods (Priority 0 - Ubuntu Static Deployment)
  createDeployment(workspaceId: string, status: string, buildCommand?: string): Promise<import("@shared/schema").Deployment>;
  updateDeployment(id: string, updates: Partial<Pick<import("@shared/schema").Deployment, 'status' | 'buildLogs' | 'artifactPath' | 'url' | 'errorMessage' | 'completedAt'>>): Promise<import("@shared/schema").Deployment | undefined>;
  getDeployments(workspaceId: string): Promise<import("@shared/schema").Deployment[]>;
  getLatestDeployment(workspaceId: string): Promise<import("@shared/schema").Deployment | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private sessions: Map<string, Session>;
  private workspaces: Map<string, Workspace>;
  private files: Map<string, File>;
  private chatMessages: Map<string, ChatMessage>;
  private agentExecutions: Map<string, AgentExecution>;
  private packages: Map<string, Package>;
  private codeExecutions: Map<string, CodeExecution>;
  private workspaceSettings: Map<string, WorkspaceSettings>;
  private yjsDocuments: Map<string, Map<string, YjsDocument>>; // workspace -> docName -> YjsDocument
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.workspaces = new Map();
    this.files = new Map();
    this.chatMessages = new Map();
    this.agentExecutions = new Map();
    this.packages = new Map();
    this.codeExecutions = new Map();
    this.workspaceSettings = new Map();
    this.yjsDocuments = new Map();
  }

  /**
   * Initialize storage with default data
   * Must be called before using the storage
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.initializeDefaultData();
    await this.initPromise;
    this.initialized = true;
  }

  private async initializeDefaultData() {
    const defaultWorkspace: Workspace = {
      id: "default-workspace",
      name: "my-project",
      userId: "user1",
      createdAt: new Date(),
    };
    this.workspaces.set(defaultWorkspace.id, defaultWorkspace);

    // Initialize workspace directory
    await fileSync.initializeWorkspace(defaultWorkspace.id);

    // Add some default files
    const files = [
      { path: "src/App.tsx", content: `import { useState } from 'react';\n\nfunction App() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <div className="App">\n      <h1>Hello World</h1>\n      <p>Count: {count}</p>\n      <button onClick={() => setCount(count + 1)}>\n        Increment\n      </button>\n    </div>\n  );\n}\n\nexport default App;`, language: "typescript" },
      { path: "src/index.tsx", content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);`, language: "typescript" },
      { path: "package.json", content: `{\n  "name": "my-project",\n  "version": "1.0.0",\n  "dependencies": {\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  }\n}`, language: "json" },
    ];

    const createdFiles: File[] = [];
    files.forEach(file => {
      const id = randomUUID();
      const fileObj: File = {
        id,
        workspaceId: defaultWorkspace.id,
        path: file.path,
        content: file.content,
        language: file.language,
        updatedAt: new Date(),
      };
      this.files.set(id, fileObj);
      createdFiles.push(fileObj);
    });

    // Sync all default files to disk
    await fileSync.syncFiles(createdFiles);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      email: insertUser.email || null,
      isActive: "true",
      emailVerifiedAt: null,
      failedLoginCount: "0",
      lockedUntil: null,
      createdAt: new Date(),
      lastLoginAt: null,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) {
      return undefined;
    }
    const updated = { ...user, ...updates };
    this.users.set(id, updated);
    return updated;
  }

  // Session methods
  async createSession(insertSession: InsertSession): Promise<Session> {
    // Enforce max sessions per user
    const userSessions = await this.getSessionsByUserId(insertSession.userId);
    if (userSessions.length >= MAX_SESSIONS_PER_USER) {
      throw new Error(`Maximum ${MAX_SESSIONS_PER_USER} active sessions per user exceeded`);
    }
    
    const id = randomUUID();
    const session: Session = {
      id,
      ...insertSession,
      userAgent: insertSession.userAgent || null,
      ipAddress: insertSession.ipAddress || null,
      createdAt: new Date(),
    };
    this.sessions.set(id, session);
    return session;
  }

  async getSessionByTokenHash(tokenHash: string): Promise<Session | undefined> {
    return Array.from(this.sessions.values()).find(
      (session) => session.refreshTokenHash === tokenHash
    );
  }

  async getSessionsByUserId(userId: string): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter(
      (session) => session.userId === userId
    );
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async deleteUserSessions(userId: string): Promise<void> {
    Array.from(this.sessions.entries()).forEach(([id, session]) => {
      if (session.userId === userId) {
        this.sessions.delete(id);
      }
    });
  }

  async rotateSession(oldSessionId: string, newSession: InsertSession): Promise<Session> {
    // Verify old session exists (critical for reuse detection)
    const oldSession = this.sessions.get(oldSessionId);
    if (!oldSession) {
      throw new Error("Session not found - possible token reuse detected");
    }
    
    // Verify userId alignment (prevent session hijacking)
    if (oldSession.userId !== newSession.userId) {
      throw new Error("Session userId mismatch - possible attack detected");
    }
    
    // Delete old session
    this.sessions.delete(oldSessionId);
    
    // Create new session (rotation replaces 1:1, no cap re-check needed)
    const id = randomUUID();
    const session: Session = {
      id,
      ...newSession,
      userAgent: newSession.userAgent || null,
      ipAddress: newSession.ipAddress || null,
      createdAt: new Date(),
    };
    this.sessions.set(id, session);
    return session;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    let count = 0;
    
    Array.from(this.sessions.entries()).forEach(([id, session]) => {
      if (session.expiresAt < now) {
        this.sessions.delete(id);
        count++;
      }
    });
    
    return count;
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    return this.workspaces.get(id);
  }

  async getWorkspacesByUserId(userId: string): Promise<Workspace[]> {
    return Array.from(this.workspaces.values()).filter(
      (workspace) => workspace.userId === userId
    );
  }

  async createWorkspace(name: string, userId: string): Promise<Workspace> {
    const id = randomUUID();
    const workspace: Workspace = {
      id,
      name,
      userId,
      createdAt: new Date(),
    };
    this.workspaces.set(id, workspace);
    return workspace;
  }

  async deleteWorkspace(id: string): Promise<void> {
    this.workspaces.delete(id);
    // Also delete associated files
    Array.from(this.files.entries()).forEach(([fileId, file]) => {
      if (file.workspaceId === id) {
        this.files.delete(fileId);
      }
    });
  }

  async getFile(id: string): Promise<File | undefined> {
    return this.files.get(id);
  }

  async getFilesByWorkspace(workspaceId: string): Promise<File[]> {
    return Array.from(this.files.values()).filter(
      (file) => file.workspaceId === workspaceId
    );
  }

  async getFileByPath(workspaceId: string, path: string): Promise<File | undefined> {
    return Array.from(this.files.values()).find(
      (file) => file.workspaceId === workspaceId && file.path === path
    );
  }

  async createFile(
    workspaceId: string,
    path: string,
    content: string,
    language?: string | null
  ): Promise<File> {
    const id = randomUUID();
    const file: File = {
      id,
      workspaceId,
      path,
      content,
      language: language || null,
      updatedAt: new Date(),
    };
    this.files.set(id, file);
    
    // Sync file to disk in local mode
    await fileSync.syncFile(file);
    
    return file;
  }

  async updateFile(id: string, content: string): Promise<File | undefined> {
    const file = this.files.get(id);
    if (file) {
      file.content = content;
      file.updatedAt = new Date();
      this.files.set(id, file);
      
      // Sync updated file to disk in local mode
      await fileSync.syncFile(file);
    }
    return file;
  }

  async renameFile(id: string, newPath: string): Promise<File | undefined> {
    const file = this.files.get(id);
    if (!file) {
      return undefined;
    }
    
    // Check if target path already exists (excluding the current file)
    const existing = await this.getFileByPath(file.workspaceId, newPath);
    if (existing && existing.id !== id) {
      throw new Error("A file already exists at the target path");
    }
    
    const oldPath = file.path;
    
    // Delete old file from disk
    await fileSync.deleteFile(file.workspaceId, oldPath);
    
    // Update path
    file.path = newPath;
    file.updatedAt = new Date();
    this.files.set(id, file);
    
    // Sync new file to disk
    await fileSync.syncFile(file);
    
    return file;
  }

  async deleteFile(id: string): Promise<void> {
    const file = this.files.get(id);
    if (file) {
      // Delete from disk in local mode (now workspace-aware)
      await fileSync.deleteFile(file.workspaceId, file.path);
    }
    this.files.delete(id);
  }

  async getChatMessages(workspaceId: string): Promise<ChatMessage[]> {
    return Array.from(this.chatMessages.values())
      .filter((msg) => msg.workspaceId === workspaceId)
      .sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime());
  }

  async createChatMessage(
    workspaceId: string,
    role: string,
    content: string,
    metadata?: any | null
  ): Promise<ChatMessage> {
    const id = randomUUID();
    const message: ChatMessage = {
      id,
      workspaceId,
      role,
      content,
      metadata: metadata || null,
      createdAt: new Date(),
    };
    this.chatMessages.set(id, message);
    return message;
  }

  async getAgentExecution(workspaceId: string): Promise<AgentExecution | undefined> {
    return Array.from(this.agentExecutions.values()).find(
      (execution) => execution.workspaceId === workspaceId
    );
  }

  async createOrUpdateAgentExecution(
    workspaceId: string,
    data: {
      prompt?: string;
      status: string;
      current_step: string;
      progress: number;
      attempt_count?: number;
      last_failed_step?: string | null;
      logs: any[];
      structuredLogs?: any[]; // Phase 2
      files_generated: any[];
      errors: any[];
    }
  ): Promise<AgentExecution> {
    const existing = await this.getAgentExecution(workspaceId);
    
    if (existing) {
      existing.prompt = data.prompt || existing.prompt;
      existing.status = data.status;
      existing.current_step = data.current_step;
      existing.progress = data.progress;
      existing.attempt_count = data.attempt_count !== undefined ? data.attempt_count : (existing.attempt_count || 0);
      existing.last_failed_step = data.last_failed_step !== undefined ? data.last_failed_step : existing.last_failed_step;
      existing.logs = data.logs;
      existing.structuredLogs = data.structuredLogs ?? existing.structuredLogs ?? null; // Phase 2
      existing.files_generated = data.files_generated;
      existing.errors = data.errors;
      existing.updatedAt = new Date();
      this.agentExecutions.set(existing.id, existing);
      return existing;
    }

    const id = randomUUID();
    const execution: AgentExecution = {
      id,
      workspaceId,
      prompt: data.prompt || null,
      status: data.status,
      current_step: data.current_step,
      progress: data.progress,
      attempt_count: data.attempt_count || 0,
      last_failed_step: data.last_failed_step ?? null,
      logs: data.logs,
      structuredLogs: data.structuredLogs ?? null, // Phase 2
      files_generated: data.files_generated,
      errors: data.errors,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.agentExecutions.set(id, execution);
    return execution;
  }

  async getPackages(workspaceId: string): Promise<Package[]> {
    return Array.from(this.packages.values()).filter(
      (pkg) => pkg.workspaceId === workspaceId
    );
  }

  async upsertPackage(
    workspaceId: string,
    name: string,
    version: string | null,
    packageManager: string
  ): Promise<Package> {
    // Check if package already exists (simulating unique constraint)
    const existing = Array.from(this.packages.values()).find(
      (pkg) =>
        pkg.workspaceId === workspaceId &&
        pkg.packageManager === packageManager &&
        pkg.name === name
    );

    if (existing) {
      // Update existing package
      existing.version = version;
      existing.installedAt = new Date();
      this.packages.set(existing.id, existing);
      return existing;
    }

    // Create new package
    const id = randomUUID();
    const pkg: Package = {
      id,
      workspaceId,
      name,
      version,
      packageManager,
      installedAt: new Date(),
    };
    this.packages.set(id, pkg);
    return pkg;
  }

  async deletePackage(id: string): Promise<void> {
    this.packages.delete(id);
  }

  // Code Execution Methods

  async getCodeExecution(id: string): Promise<CodeExecution | undefined> {
    return this.codeExecutions.get(id);
  }

  async getCodeExecutions(workspaceId: string): Promise<CodeExecution[]> {
    return Array.from(this.codeExecutions.values())
      .filter(execution => execution.workspaceId === workspaceId)
      .sort((a, b) => {
        const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
        const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
        return bTime - aTime; // Most recent first
      });
  }

  async createCodeExecution(workspaceId: string, filePath: string, language?: string): Promise<CodeExecution> {
    const id = randomUUID();
    const execution: CodeExecution = {
      id,
      workspaceId,
      filePath,
      language: language || null,
      status: 'running',
      output: null,
      error: null,
      exitCode: null,
      startedAt: new Date(),
      completedAt: null,
    };
    this.codeExecutions.set(id, execution);
    return execution;
  }

  async updateCodeExecution(
    id: string, 
    updates: Partial<Pick<CodeExecution, 'status' | 'output' | 'error' | 'exitCode' | 'completedAt'>>
  ): Promise<CodeExecution | undefined> {
    const execution = this.codeExecutions.get(id);
    if (!execution) {
      return undefined;
    }

    const updated: CodeExecution = {
      ...execution,
      ...updates,
    };

    this.codeExecutions.set(id, updated);
    return updated;
  }

  async appendCodeExecutionOutput(id: string, chunk: string): Promise<CodeExecution | undefined> {
    const execution = this.codeExecutions.get(id);
    if (!execution) {
      return undefined;
    }

    const updated: CodeExecution = {
      ...execution,
      output: (execution.output || '') + chunk,
    };

    this.codeExecutions.set(id, updated);
    return updated;
  }

  async getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings | undefined> {
    return Array.from(this.workspaceSettings.values())
      .find((s) => s.workspaceId === workspaceId);
  }

  async upsertWorkspaceSettings(workspaceId: string, settings: UpdateWorkspaceSettings): Promise<WorkspaceSettings> {
    const existing = await this.getWorkspaceSettings(workspaceId);
    
    if (existing) {
      const updated: WorkspaceSettings = {
        ...existing,
        ...settings,
        updatedAt: new Date(),
      };
      this.workspaceSettings.set(existing.id, updated);
      return updated;
    } else {
      const id = randomUUID();
      const newSettings: WorkspaceSettings = {
        id,
        workspaceId,
        modelProvider: settings.modelProvider || 'openai',
        extendedThinking: settings.extendedThinking || 'false',
        localFirst: settings.localFirst || 'false',
        autoFix: settings.autoFix || 'true',
        maxIterations: settings.maxIterations || '5',
        fontSize: settings.fontSize || '14',
        autoSave: settings.autoSave || 'true',
        updatedAt: new Date(),
      };
      this.workspaceSettings.set(id, newSettings);
      return newSettings;
    }
  }

  // Yjs document methods (Phase 7 - Multiplayer)
  async getYjsDocument(workspaceId: string, docName: string): Promise<YjsDocument | undefined> {
    const workspaceDocs = this.yjsDocuments.get(workspaceId);
    if (!workspaceDocs) {
      return undefined;
    }
    return workspaceDocs.get(docName);
  }

  async upsertYjsDocument(workspaceId: string, docName: string, state: string, stateVector: string): Promise<YjsDocument> {
    let workspaceDocs = this.yjsDocuments.get(workspaceId);
    if (!workspaceDocs) {
      workspaceDocs = new Map();
      this.yjsDocuments.set(workspaceId, workspaceDocs);
    }

    const existing = workspaceDocs.get(docName);
    
    if (existing) {
      const updated: YjsDocument = {
        ...existing,
        state,
        stateVector,
        updatedAt: new Date(),
      };
      workspaceDocs.set(docName, updated);
      return updated;
    } else {
      const id = randomUUID();
      const newDoc: YjsDocument = {
        id,
        workspaceId,
        docName,
        state,
        stateVector,
        updatedAt: new Date(),
      };
      workspaceDocs.set(docName, newDoc);
      return newDoc;
    }
  }

  async deleteYjsDocument(workspaceId: string, docName: string): Promise<void> {
    const workspaceDocs = this.yjsDocuments.get(workspaceId);
    if (workspaceDocs) {
      workspaceDocs.delete(docName);
      if (workspaceDocs.size === 0) {
        this.yjsDocuments.delete(workspaceId);
      }
    }
  }
}

export const storage = new MemStorage();
