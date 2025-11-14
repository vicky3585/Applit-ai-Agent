/**
 * PostgreSQL Storage Implementation
 * 
 * Uses Drizzle ORM to implement the IStorage interface with PostgreSQL.
 * Referenced from blueprint:javascript_database
 */

import { db } from "./db";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import {
  users,
  sessions,
  workspaces,
  files,
  chatMessages,
  agentExecutions,
  packages,
  codeExecutions,
  workspaceSettings,
  yjsDocuments,
  deployments,
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
  type Deployment,
} from "@shared/schema";
import { fileSync } from "./file-sync";
import type { IStorage } from "./storage";

// Security configuration (matching MemStorage)
const MAX_SESSIONS_PER_USER = parseInt(process.env.MAX_SESSIONS_PER_USER || "5");

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
        userId: "user1",
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

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  // Shared helper: Enforce session cap with advisory locking
  // Uses PostgreSQL advisory locks for guaranteed mutual exclusion without requiring user row to exist
  private async withSessionLock<T>(
    userId: string,
    mutation: (tx: any) => Promise<T>
  ): Promise<T> {
    return await db.transaction(async (tx) => {
      // Use PostgreSQL advisory lock based on userId hash
      // This guarantees mutual exclusion even if user doesn't exist
      const userIdHash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${userIdHash})`);
      
      // Execute mutation with lock held
      const result = await mutation(tx);
      
      // Re-check session count before commit (final cap enforcement)
      const userSessions = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.userId, userId));
      
      if (userSessions.length > MAX_SESSIONS_PER_USER) {
        throw new Error(`Maximum ${MAX_SESSIONS_PER_USER} active sessions per user exceeded`);
      }
      
      return result;
    });
  }

  // Session methods
  async createSession(insertSession: InsertSession): Promise<Session> {
    return this.withSessionLock(insertSession.userId, async (tx) => {
      // Count sessions (pre-insert check)
      const userSessions = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.userId, insertSession.userId));
      
      if (userSessions.length >= MAX_SESSIONS_PER_USER) {
        throw new Error(`Maximum ${MAX_SESSIONS_PER_USER} active sessions per user exceeded`);
      }
      
      // Insert new session
      const [session] = await tx
        .insert(sessions)
        .values(insertSession)
        .returning();
      
      return session;
    });
  }

  async getSessionByTokenHash(tokenHash: string): Promise<Session | undefined> {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, tokenHash));
    return session || undefined;
  }

  async getSessionsByUserId(userId: string): Promise<Session[]> {
    return await db
      .select()
      .from(sessions)
      .where(eq(sessions.userId, userId));
  }

  async deleteSession(id: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id));
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }

  async rotateSession(oldSessionId: string, newSession: InsertSession): Promise<Session> {
    return this.withSessionLock(newSession.userId, async (tx) => {
      // Lock and verify old session exists (critical for reuse detection)
      const oldSessionRows = await tx.execute(
        sql`SELECT * FROM ${sessions} WHERE id = ${oldSessionId} FOR UPDATE`
      );
      
      if (oldSessionRows.rows.length === 0) {
        throw new Error("Session not found - possible token reuse detected");
      }
      
      const oldSession = oldSessionRows.rows[0] as any;
      
      // Verify userId alignment (prevent session hijacking)
      if (oldSession.user_id !== newSession.userId) {
        throw new Error("Session userId mismatch - possible attack detected");
      }
      
      // Delete old session
      await tx.delete(sessions).where(eq(sessions.id, oldSessionId));
      
      // Insert new session (withSessionLock enforces cap on commit)
      const [session] = await tx
        .insert(sessions)
        .values(newSession)
        .returning();
      
      return session;
    });
  }

  async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    const deleted = await db
      .delete(sessions)
      .where(lt(sessions.expiresAt, now))
      .returning();
    
    return deleted.length;
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

  async getFileByPath(workspaceId: string, path: string): Promise<File | undefined> {
    const [file] = await db
      .select()
      .from(files)
      .where(
        and(
          eq(files.workspaceId, workspaceId),
          eq(files.path, path)
        )
      );
    return file || undefined;
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

  async renameFile(id: string, newPath: string): Promise<File | undefined> {
    // Get file record first to clean up old disk location
    const oldFile = await this.getFile(id);
    if (!oldFile) {
      return undefined;
    }
    
    // Check if target path already exists (excluding the current file)
    const existing = await this.getFileByPath(oldFile.workspaceId, newPath);
    if (existing && existing.id !== id) {
      throw new Error("A file already exists at the target path");
    }
    
    // Update file path in database
    const [file] = await db
      .update(files)
      .set({ path: newPath, updatedAt: new Date() })
      .where(eq(files.id, id))
      .returning();
    
    if (file && oldFile) {
      // Delete old file from disk
      await fileSync.deleteFile(oldFile.workspaceId, oldFile.path);
      
      // Sync new file to disk
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
  ): Promise<AgentExecution> {
    // Use transaction with FOR UPDATE lock to prevent concurrent update race conditions
    return await db.transaction(async (tx) => {
      // Lock and fetch existing execution (if exists)
      const [existing] = await tx
        .select()
        .from(agentExecutions)
        .where(eq(agentExecutions.workspaceId, workspaceId))
        .orderBy(desc(agentExecutions.updatedAt))
        .limit(1)
        .for('update');

      if (existing) {
        // Preserve existing logs/structured logs by concatenating arrays (prevent data loss)
        const existingLogs = Array.isArray(existing.logs) ? existing.logs : [];
        const existingStructuredLogs = Array.isArray(existing.structuredLogs) ? existing.structuredLogs : [];
        
        const updatedLogs = data.logs && data.logs.length > 0 ? [...existingLogs, ...data.logs] : existingLogs;
        const updatedStructuredLogs = data.structuredLogs && data.structuredLogs.length > 0 
          ? [...existingStructuredLogs, ...data.structuredLogs] 
          : existingStructuredLogs;
        
        // Update existing execution
        const [updated] = await tx
          .update(agentExecutions)
          .set({
            prompt: data.prompt || existing.prompt,
            status: data.status,
            current_step: data.current_step,
            progress: data.progress,
            attempt_count: data.attempt_count !== undefined ? data.attempt_count : existing.attempt_count,
            last_failed_step: data.last_failed_step !== undefined ? data.last_failed_step : existing.last_failed_step,
            logs: updatedLogs,
            structuredLogs: updatedStructuredLogs,
            files_generated: data.files_generated,
            errors: data.errors,
            updatedAt: new Date(),
          })
          .where(eq(agentExecutions.id, existing.id))
          .returning();
        return updated;
      } else {
        // Create new execution
        const [created] = await tx
          .insert(agentExecutions)
          .values({
            workspaceId,
            prompt: data.prompt || null,
            status: data.status,
            current_step: data.current_step,
            progress: data.progress,
            attempt_count: data.attempt_count || 0,
            last_failed_step: data.last_failed_step ?? null,
            logs: data.logs,
            structuredLogs: data.structuredLogs || [],
            files_generated: data.files_generated,
            errors: data.errors,
          })
          .returning();
        return created;
      }
    });
  }

  // Package methods
  async getPackages(workspaceId: string): Promise<Package[]> {
    return await db
      .select()
      .from(packages)
      .where(eq(packages.workspaceId, workspaceId));
  }

  async upsertPackage(
    workspaceId: string,
    name: string,
    version: string | null,
    packageManager: string
  ): Promise<Package> {
    // Try to insert, on conflict update
    const [pkg] = await db
      .insert(packages)
      .values({ workspaceId, name, version, packageManager })
      .onConflictDoUpdate({
        target: [packages.workspaceId, packages.packageManager, packages.name],
        set: { version, installedAt: new Date() },
      })
      .returning();
    
    return pkg;
  }

  async deletePackage(id: string): Promise<void> {
    await db.delete(packages).where(eq(packages.id, id));
  }

  // Code execution methods
  async getCodeExecution(id: string): Promise<CodeExecution | undefined> {
    const [execution] = await db
      .select()
      .from(codeExecutions)
      .where(eq(codeExecutions.id, id));
    return execution || undefined;
  }

  async getCodeExecutions(workspaceId: string): Promise<CodeExecution[]> {
    return await db
      .select()
      .from(codeExecutions)
      .where(eq(codeExecutions.workspaceId, workspaceId))
      .orderBy(desc(codeExecutions.startedAt));
  }

  async createCodeExecution(
    workspaceId: string,
    filePath: string,
    language?: string
  ): Promise<CodeExecution> {
    const [execution] = await db
      .insert(codeExecutions)
      .values({
        workspaceId,
        filePath,
        language,
        status: "running",
      })
      .returning();
    return execution;
  }

  async updateCodeExecution(
    id: string,
    updates: Partial<Pick<CodeExecution, 'status' | 'output' | 'error' | 'exitCode' | 'completedAt'>>
  ): Promise<CodeExecution | undefined> {
    // Ensure completedAt is set if status is 'completed' or 'failed'
    const finalUpdates = {
      ...updates,
      completedAt: updates.status && ['completed', 'failed'].includes(updates.status) 
        ? (updates.completedAt || new Date())
        : updates.completedAt,
    };
    
    const [execution] = await db
      .update(codeExecutions)
      .set(finalUpdates)
      .where(eq(codeExecutions.id, id))
      .returning();
    return execution || undefined;
  }

  async appendCodeExecutionOutput(id: string, chunk: string): Promise<CodeExecution | undefined> {
    // Get current execution
    const execution = await this.getCodeExecution(id);
    if (!execution) {
      return undefined;
    }

    // Append to output
    const newOutput = (execution.output || "") + chunk;

    // Update with appended output
    const [updated] = await db
      .update(codeExecutions)
      .set({ output: newOutput })
      .where(eq(codeExecutions.id, id))
      .returning();
    
    return updated || undefined;
  }

  // Settings methods
  async getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettings | undefined> {
    const [settings] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId));
    return settings || undefined;
  }

  async upsertWorkspaceSettings(
    workspaceId: string,
    settings: UpdateWorkspaceSettings
  ): Promise<WorkspaceSettings> {
    // Try to insert, on conflict update (always set updatedAt timestamp)
    const now = new Date();
    const [result] = await db
      .insert(workspaceSettings)
      .values({ workspaceId, ...settings, updatedAt: now })
      .onConflictDoUpdate({
        target: [workspaceSettings.workspaceId],
        set: { ...settings, updatedAt: now },
      })
      .returning();
    
    return result;
  }

  // Yjs document methods (Phase 7 - Multiplayer)
  async getYjsDocument(workspaceId: string, docName: string): Promise<YjsDocument | undefined> {
    const [doc] = await db
      .select()
      .from(yjsDocuments)
      .where(
        and(
          eq(yjsDocuments.workspaceId, workspaceId),
          eq(yjsDocuments.docName, docName)
        )
      );
    return doc || undefined;
  }

  async upsertYjsDocument(
    workspaceId: string,
    docName: string,
    state: string,
    stateVector: string
  ): Promise<YjsDocument> {
    // Try to insert, on conflict update
    const [doc] = await db
      .insert(yjsDocuments)
      .values({ workspaceId, docName, state, stateVector })
      .onConflictDoUpdate({
        target: [yjsDocuments.workspaceId, yjsDocuments.docName],
        set: { state, stateVector, updatedAt: new Date() },
      })
      .returning();
    
    return doc;
  }

  async deleteYjsDocument(workspaceId: string, docName: string): Promise<void> {
    await db
      .delete(yjsDocuments)
      .where(
        and(
          eq(yjsDocuments.workspaceId, workspaceId),
          eq(yjsDocuments.docName, docName)
        )
      );
  }

  async createDeployment(
    workspaceId: string, 
    status: import("@shared/schema").DeploymentStatus, 
    buildCommand?: string
  ): Promise<Deployment> {
    const [deployment] = await db
      .insert(deployments)
      .values({
        id: crypto.randomUUID(),
        workspaceId,
        status,
        buildCommand: buildCommand || null,
        createdAt: new Date(),
      })
      .returning();
    return deployment;
  }

  async updateDeployment(
    id: string,
    updates: Partial<Pick<Deployment, 'status' | 'buildLogs' | 'artifactPath' | 'url' | 'errorMessage' | 'completedAt'>>
  ): Promise<Deployment | undefined> {
    const [updated] = await db
      .update(deployments)
      .set(updates)
      .where(eq(deployments.id, id))
      .returning();
    return updated;
  }

  async getDeployments(workspaceId: string): Promise<Deployment[]> {
    return db
      .select()
      .from(deployments)
      .where(eq(deployments.workspaceId, workspaceId))
      .orderBy(desc(deployments.createdAt));
  }

  async getLatestDeployment(workspaceId: string): Promise<Deployment | undefined> {
    const [latest] = await db
      .select()
      .from(deployments)
      .where(eq(deployments.workspaceId, workspaceId))
      .orderBy(desc(deployments.createdAt))
      .limit(1);
    return latest;
  }
}
