import { 
  type User, 
  type InsertUser,
  type Workspace,
  type File,
  type ChatMessage,
  type AgentExecution,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { fileSync } from "./file-sync";

export interface IStorage {
  // Initialization method
  initialize(): Promise<void>;
  
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Workspace methods
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByUserId(userId: string): Promise<Workspace[]>;
  createWorkspace(name: string, userId: string): Promise<Workspace>;
  deleteWorkspace(id: string): Promise<void>;
  
  // File methods
  getFile(id: string): Promise<File | undefined>;
  getFilesByWorkspace(workspaceId: string): Promise<File[]>;
  createFile(workspaceId: string, path: string, content: string, language?: string): Promise<File>;
  updateFile(id: string, content: string): Promise<File | undefined>;
  deleteFile(id: string): Promise<void>;
  
  // Chat methods
  getChatMessages(workspaceId: string): Promise<ChatMessage[]>;
  createChatMessage(workspaceId: string, role: string, content: string, metadata?: any): Promise<ChatMessage>;
  
  // Agent execution methods
  getAgentExecution(workspaceId: string): Promise<AgentExecution | undefined>;
  createOrUpdateAgentExecution(
    workspaceId: string, 
    status: string, 
    currentNode?: string, 
    metadata?: any
  ): Promise<AgentExecution>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private workspaces: Map<string, Workspace>;
  private files: Map<string, File>;
  private chatMessages: Map<string, ChatMessage>;
  private agentExecutions: Map<string, AgentExecution>;
  private initialized: boolean = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.users = new Map();
    this.workspaces = new Map();
    this.files = new Map();
    this.chatMessages = new Map();
    this.agentExecutions = new Map();
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
      userId: "default-user",
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
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
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
    status: string,
    currentNode?: string | null,
    metadata?: any | null
  ): Promise<AgentExecution> {
    const existing = await this.getAgentExecution(workspaceId);
    
    if (existing) {
      existing.status = status;
      existing.currentNode = currentNode || null;
      existing.metadata = metadata || null;
      existing.updatedAt = new Date();
      this.agentExecutions.set(existing.id, existing);
      return existing;
    }

    const id = randomUUID();
    const execution: AgentExecution = {
      id,
      workspaceId,
      status,
      currentNode: currentNode || null,
      metadata: metadata || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.agentExecutions.set(id, execution);
    return execution;
  }
}

export const storage = new MemStorage();
