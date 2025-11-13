/**
 * PostgreSQL Storage Implementation
 * 
 * Uses Drizzle ORM to implement the IStorage interface with PostgreSQL.
 * Referenced from blueprint:javascript_database
 */

import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";
import {
  users,
  workspaces,
  files,
  chatMessages,
  agentExecutions,
  type User,
  type InsertUser,
  type Workspace,
  type File,
  type ChatMessage,
  type AgentExecution,
} from "@shared/schema";
import { fileSync } from "./file-sync";
import type { IStorage } from "./storage";

export class PostgresStorage implements IStorage {
  private initialized: boolean = false;

  /**
   * Initialize storage with default data if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Check if default workspace exists
    const existing = await this.getWorkspace("default-workspace");
    
    if (!existing) {
      await this.initializeDefaultData();
    }

    this.initialized = true;
  }

  private async initializeDefaultData() {
    // Create default workspace with explicit ID
    const [defaultWorkspace] = await db
      .insert(workspaces)
      .values({
        id: "default-workspace",
        name: "my-project",
        userId: "default-user",
      })
      .returning();

    // Initialize workspace directory
    await fileSync.initializeWorkspace(defaultWorkspace.id);

    // Add default files (matching MemStorage exactly)
    const defaultFiles = [
      {
        path: "src/App.tsx",
        content: `import { useState } from 'react';\n\nfunction App() {\n  const [count, setCount] = useState(0);\n\n  return (\n    <div className="App">\n      <h1>Hello World</h1>\n      <p>Count: {count}</p>\n      <button onClick={() => setCount(count + 1)}>\n        Increment\n      </button>\n    </div>\n  );\n}\n\nexport default App;`,
        language: "typescript",
      },
      {
        path: "src/index.tsx",
        content: `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\n\nReactDOM.createRoot(document.getElementById('root')!).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);`,
        language: "typescript",
      },
      {
        path: "package.json",
        content: `{\n  "name": "my-project",\n  "version": "1.0.0",\n  "dependencies": {\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  }\n}`,
        language: "json",
      },
    ];

    const createdFiles = await db
      .insert(files)
      .values(
        defaultFiles.map((file) => ({
          workspaceId: defaultWorkspace.id,
          path: file.path,
          content: file.content,
          language: file.language,
        }))
      )
      .returning();

    // Sync all default files to disk (matching MemStorage)
    await fileSync.syncFiles(createdFiles);
  }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Workspace methods
  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return workspace || undefined;
  }

  async getWorkspacesByUserId(userId: string): Promise<Workspace[]> {
    return await db.select().from(workspaces).where(eq(workspaces.userId, userId));
  }

  async createWorkspace(name: string, userId: string): Promise<Workspace> {
    const [workspace] = await db
      .insert(workspaces)
      .values({ name, userId })
      .returning();
    
    // Initialize workspace directory
    await fileSync.initializeWorkspace(workspace.id);
    
    return workspace;
  }

  async deleteWorkspace(id: string): Promise<void> {
    // Delete associated files from database
    await db.delete(files).where(eq(files.workspaceId, id));
    // Delete workspace from database
    await db.delete(workspaces).where(eq(workspaces.id, id));
    // Clean up workspace directory from disk (matching MemStorage behavior)
    await fileSync.deleteWorkspace(id);
  }

  // File methods
  async getFile(id: string): Promise<File | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
    return file || undefined;
  }

  async getFilesByWorkspace(workspaceId: string): Promise<File[]> {
    return await db.select().from(files).where(eq(files.workspaceId, workspaceId));
  }

  async createFile(
    workspaceId: string,
    path: string,
    content: string,
    language?: string
  ): Promise<File> {
    const [file] = await db
      .insert(files)
      .values({ workspaceId, path, content, language })
      .returning();
    
    // Sync to disk
    await fileSync.syncFiles([file]);
    
    return file;
  }

  async updateFile(id: string, content: string): Promise<File | undefined> {
    const [file] = await db
      .update(files)
      .set({ content, updatedAt: new Date() })
      .where(eq(files.id, id))
      .returning();
    
    if (file) {
      // Sync to disk
      await fileSync.syncFiles([file]);
    }
    
    return file || undefined;
  }

  async deleteFile(id: string): Promise<void> {
    // Get file record first to clean up disk
    const file = await this.getFile(id);
    
    // Delete from database
    await db.delete(files).where(eq(files.id, id));
    
    // Delete from disk (matching MemStorage behavior)
    if (file) {
      await fileSync.deleteFile(file.workspaceId, file.path);
    }
  }

  // Chat methods
  async getChatMessages(workspaceId: string): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.workspaceId, workspaceId))
      .orderBy(chatMessages.createdAt);
  }

  async createChatMessage(
    workspaceId: string,
    role: string,
    content: string,
    metadata?: any
  ): Promise<ChatMessage> {
    const [message] = await db
      .insert(chatMessages)
      .values({ workspaceId, role, content, metadata })
      .returning();
    return message;
  }

  // Agent execution methods
  async getAgentExecution(workspaceId: string): Promise<AgentExecution | undefined> {
    // Get the LATEST execution (order by updatedAt descending)
    const [execution] = await db
      .select()
      .from(agentExecutions)
      .where(eq(agentExecutions.workspaceId, workspaceId))
      .orderBy(desc(agentExecutions.updatedAt))
      .limit(1);
    
    return execution || undefined;
  }

  async createOrUpdateAgentExecution(
    workspaceId: string,
    status: string,
    currentNode?: string,
    metadata?: any
  ): Promise<AgentExecution> {
    // Try to find existing execution
    const existing = await this.getAgentExecution(workspaceId);

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(agentExecutions)
        .set({
          status,
          currentNode,
          metadata,
          updatedAt: new Date(),
        })
        .where(eq(agentExecutions.id, existing.id))
        .returning();
      return updated;
    } else {
      // Create new
      const [created] = await db
        .insert(agentExecutions)
        .values({ workspaceId, status, currentNode, metadata })
        .returning();
      return created;
    }
  }
}
