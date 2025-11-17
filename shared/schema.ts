import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").unique(),
  password: text("password").notNull(), // bcrypt hash
  isActive: text("is_active").default("true").notNull(),
  emailVerifiedAt: timestamp("email_verified_at"),
  failedLoginCount: text("failed_login_count").default("0").notNull(),
  lockedUntil: timestamp("locked_until"),
  createdAt: timestamp("created_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  refreshTokenHash: text("refresh_token_hash").notNull().unique(), // bcrypt hash of refresh token
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  userAgent: text("user_agent"),
  ipAddress: text("ip_address"),
}, (table) => ({
  // Indexes for efficient queries
  userIdIdx: sql`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON ${table} (${table.userId})`,
  expiresAtIdx: sql`CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON ${table} (${table.expiresAt})`,
}));

export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  userId: varchar("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const files = pgTable("files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  path: text("path").notNull(),
  content: text("content").notNull(),
  language: text("language"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  role: text("role").notNull(), // 'user' | 'agent'
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agentExecutions = pgTable("agent_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  prompt: text("prompt"),
  status: text("status").notNull(), // 'idle' | 'processing' | 'complete' | 'failed'
  current_step: text("current_step").notNull(), // 'idle' | 'planning' | 'coding' | 'testing' | 'fixing' | 'complete'
  progress: real("progress").notNull().default(0.0), // 0.0 to 1.0
  attempt_count: real("attempt_count").notNull().default(0), // Current retry attempt number
  last_failed_step: text("last_failed_step"), // Last step that failed, persists through retries
  logs: jsonb("logs").notNull().default(sql`'[]'::jsonb`), // Legacy: Array of string log messages
  structuredLogs: jsonb("structured_logs").default(sql`'[]'::jsonb`), // Phase 2: Array of LogEntry objects with metadata
  files_generated: jsonb("files_generated").notNull().default(sql`'[]'::jsonb`), // Array of {path, content, language}
  errors: jsonb("errors").notNull().default(sql`'[]'::jsonb`), // Array of error messages
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const packages = pgTable("packages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  name: text("name").notNull(),
  version: text("version"),
  packageManager: text("package_manager").notNull(), // 'npm' | 'pip' | 'apt'
  installedAt: timestamp("installed_at").defaultNow(),
}, (table) => ({
  // Composite unique constraint: one package per workspace per manager
  uniquePackage: sql`UNIQUE(${table.workspaceId}, ${table.packageManager}, ${table.name})`,
}));

export const codeExecutions = pgTable("code_executions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  filePath: text("file_path").notNull(),
  language: text("language"),
  status: text("status").notNull(), // 'running' | 'completed' | 'failed'
  output: text("output"),
  error: text("error"),
  exitCode: text("exit_code"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const workspaceSettings = pgTable("workspace_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().unique(),
  modelProvider: text("model_provider").default("openai"), // 'openai' | 'anthropic' | 'local'
  autonomyLevel: text("autonomy_level").default("high"), // 'low' | 'medium' | 'high' | 'max'
  extendedThinking: text("extended_thinking").default("false"),
  localFirst: text("local_first").default("false"),
  autoFix: text("auto_fix").default("true"),
  maxIterations: text("max_iterations").default("5"),
  fontSize: text("font_size").default("14"),
  autoSave: text("auto_save").default("true"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Deployment System (Priority 0 - Ubuntu Static Deployment)
export const deployments = pgTable("deployments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // 'pending' | 'building' | 'success' | 'failed'
  buildCommand: text("build_command"), // Command executed (e.g., 'npm run build')
  buildLogs: jsonb("build_logs").default(sql`'[]'::jsonb`), // Array of log messages
  artifactPath: text("artifact_path"), // Path to built files (e.g., /var/www/ai-ide/workspace-id/current)
  url: text("url"), // Deployment URL (e.g., http://localhost/apps/workspace-id/)
  errorMessage: text("error_message"), // Error message if failed
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  workspaceIdIdx: sql`CREATE INDEX IF NOT EXISTS deployments_workspace_id_idx ON ${table} (${table.workspaceId})`,
  statusIdx: sql`CREATE INDEX IF NOT EXISTS deployments_status_idx ON ${table} (${table.status})`,
  createdAtIdx: sql`CREATE INDEX IF NOT EXISTS deployments_created_at_idx ON ${table} (${table.createdAt})`,
}));

// Multiplayer Collaboration Tables (Phase 7)
export const collaborators = pgTable("collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("viewer"), // 'owner' | 'editor' | 'viewer'
  inviteToken: text("invite_token").unique(), // For shareable invite links
  joinedAt: timestamp("joined_at").defaultNow(),
  lastActiveAt: timestamp("last_active_at").defaultNow(),
}, (table) => ({
  // Composite unique constraint: one role per user per workspace
  uniqueCollaborator: sql`UNIQUE(${table.workspaceId}, ${table.userId})`,
  workspaceIdIdx: sql`CREATE INDEX IF NOT EXISTS collaborators_workspace_id_idx ON ${table} (${table.workspaceId})`,
  userIdIdx: sql`CREATE INDEX IF NOT EXISTS collaborators_user_id_idx ON ${table} (${table.userId})`,
}));

export const yjsDocuments = pgTable("yjs_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  docName: text("doc_name").notNull(), // file path
  state: text("state"), // Y.Doc serialized state (base64 encoded)
  stateVector: text("state_vector"), // Y.Doc state vector for sync
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  // Composite unique constraint: one doc per file per workspace
  uniqueDoc: sql`UNIQUE(${table.workspaceId}, ${table.docName})`,
  workspaceIdIdx: sql`CREATE INDEX IF NOT EXISTS yjs_documents_workspace_id_idx ON ${table} (${table.workspaceId})`,
}));

// Phase 2: File Version History (Task 6 - Unified Diff Viewer)
export const fileVersionHistory = pgTable("file_version_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  version: text("version").notNull(), // Incremental version number per file
  content: text("content").notNull(),
  contentHash: text("content_hash").notNull(), // SHA-256 hash for deduplication
  changeType: text("change_type").notNull(), // 'create' | 'update' | 'delete'
  agentExecutionId: varchar("agent_execution_id"), // Optional link to agent execution
  capturedAt: timestamp("captured_at").defaultNow(),
}, (table) => ({
  // Index for efficient querying: get latest versions by workspace + path
  workspacePathVersionIdx: sql`CREATE INDEX IF NOT EXISTS file_version_workspace_path_version_idx ON ${table} (${table.workspaceId}, ${table.path}, ${table.version} DESC)`,
  workspaceIdIdx: sql`CREATE INDEX IF NOT EXISTS file_version_workspace_id_idx ON ${table} (${table.workspaceId})`,
  agentExecutionIdIdx: sql`CREATE INDEX IF NOT EXISTS file_version_agent_execution_id_idx ON ${table} (${table.agentExecutionId})`,
}));

export const collaborationChatMessages = pgTable("collaboration_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  workspaceIdIdx: sql`CREATE INDEX IF NOT EXISTS collab_chat_workspace_id_idx ON ${table} (${table.workspaceId})`,
  createdAtIdx: sql`CREATE INDEX IF NOT EXISTS collab_chat_created_at_idx ON ${table} (${table.createdAt})`,
}));

// Auth schemas with normalization and strong validation
export const registerSchema = z.object({
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Username can only contain letters, numbers, hyphens, and underscores")
    .transform(val => val.trim().toLowerCase()),
  email: z.string()
    .min(1, "Email is required")
    .email("Invalid email address")
    .transform(val => val.trim().toLowerCase()),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

export const loginSchema = z.object({
  username: z.string().transform(val => val.trim().toLowerCase()),
  password: z.string(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  password: true,
});

export const insertSessionSchema = createInsertSchema(sessions).pick({
  userId: true,
  refreshTokenHash: true,
  expiresAt: true,
  userAgent: true,
  ipAddress: true,
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).pick({
  name: true,
  userId: true,
});

export const insertFileSchema = createInsertSchema(files).pick({
  workspaceId: true,
  path: true,
  content: true,
  language: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).pick({
  workspaceId: true,
  role: true,
  content: true,
  metadata: true,
});

export const insertAgentExecutionSchema = createInsertSchema(agentExecutions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPackageSchema = createInsertSchema(packages).pick({
  workspaceId: true,
  name: true,
  version: true,
  packageManager: true,
});

export const insertCodeExecutionSchema = createInsertSchema(codeExecutions).pick({
  workspaceId: true,
  filePath: true,
  language: true,
  status: true,
});

export const insertWorkspaceSettingsSchema = createInsertSchema(workspaceSettings).omit({
  id: true,
  updatedAt: true,
});

export const updateWorkspaceSettingsSchema = createInsertSchema(workspaceSettings).omit({
  id: true,
  workspaceId: true,
  updatedAt: true,
}).partial();

export const installPackageRequestSchema = z.object({
  packages: z.array(z.string().min(1)).min(1),
  packageManager: z.enum(["npm", "pip", "apt"]),
});

// Deployment Schemas (Priority 0 - Ubuntu Static Deployment)
export const deploymentStatusSchema = z.enum(["pending", "building", "success", "failed"]);

export const insertDeploymentSchema = createInsertSchema(deployments).pick({
  workspaceId: true,
  status: true,
  buildCommand: true,
}).extend({
  status: deploymentStatusSchema,
  buildCommand: z.string().optional(),
});

export const triggerDeploymentSchema = z.object({
  buildCommand: z.string().optional(),
});

// Multiplayer Schemas (Phase 7)
export const insertCollaboratorSchema = createInsertSchema(collaborators).pick({
  workspaceId: true,
  userId: true,
  role: true,
  inviteToken: true,
});

export const insertYjsDocumentSchema = createInsertSchema(yjsDocuments).pick({
  workspaceId: true,
  docName: true,
  state: true,
  stateVector: true,
});

export const insertCollaborationChatMessageSchema = createInsertSchema(collaborationChatMessages).pick({
  workspaceId: true,
  userId: true,
  message: true,
});

export const collaboratorRoleSchema = z.enum(["owner", "editor", "viewer"]);

// Phase 2: File Version History Schemas (Task 6)
export const fileChangeTypeSchema = z.enum(["create", "update", "delete"]);

export const insertFileVersionHistorySchema = createInsertSchema(fileVersionHistory).pick({
  workspaceId: true,
  path: true,
  version: true,
  content: true,
  contentHash: true,
  changeType: true,
  agentExecutionId: true,
});

export type RegisterRequest = z.infer<typeof registerSchema>;
export type LoginRequest = z.infer<typeof loginSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type InstallPackageRequest = z.infer<typeof installPackageRequestSchema>;
export type InsertWorkspaceSettings = z.infer<typeof insertWorkspaceSettingsSchema>;
export type UpdateWorkspaceSettings = z.infer<typeof updateWorkspaceSettingsSchema>;
export type InsertCollaborator = z.infer<typeof insertCollaboratorSchema>;
export type InsertYjsDocument = z.infer<typeof insertYjsDocumentSchema>;
export type InsertCollaborationChatMessage = z.infer<typeof insertCollaborationChatMessageSchema>;
export type CollaboratorRole = z.infer<typeof collaboratorRoleSchema>;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type WorkspaceSettings = typeof workspaceSettings.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type File = typeof files.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type AgentExecution = typeof agentExecutions.$inferSelect;
export type Package = typeof packages.$inferSelect;
export type CodeExecution = typeof codeExecutions.$inferSelect;
export type Deployment = typeof deployments.$inferSelect;
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;
export type Collaborator = typeof collaborators.$inferSelect;
export type YjsDocument = typeof yjsDocuments.$inferSelect;
export type CollaborationChatMessage = typeof collaborationChatMessages.$inferSelect;
export type FileVersionHistory = typeof fileVersionHistory.$inferSelect;
export type InsertFileVersionHistory = z.infer<typeof insertFileVersionHistorySchema>;
export type FileChangeType = z.infer<typeof fileChangeTypeSchema>;

// Agent Workflow State types (from Python agent service)
export type AgentStep = "idle" | "planning" | "coding" | "testing" | "fixing" | "complete" | "failed";

export interface AgentFileGenerated {
  path: string;
  content: string;
  language?: string;
}

// Phase 2: Structured Logging System
export const logLevelSchema = z.enum(["info", "warn", "error", "success", "debug"]);
export const logPhaseSchema = z.enum([
  "system",
  "planning",
  "coding",
  "testing",
  "fixing",
  "package_install",
  "command_execution",
  "dev_server",
  "complete"
]);

export type LogLevel = z.infer<typeof logLevelSchema>;
export type LogPhase = z.infer<typeof logPhaseSchema>;

export interface LogEntry {
  id: string;
  timestamp: number; // Unix timestamp in milliseconds
  level: LogLevel;
  phase: LogPhase;
  message: string;
  metadata?: Record<string, any>; // Additional context (retry attempt, package name, etc.)
}

export const logEntrySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  level: logLevelSchema,
  phase: logPhaseSchema,
  message: z.string(),
  metadata: z.record(z.any()).optional(),
});

export interface AgentWorkflowState {
  status: "idle" | "processing" | "complete" | "failed";
  current_step: AgentStep;
  progress: number; // 0.0 to 1.0
  logs: string[]; // Legacy string logs (backward compatible)
  structuredLogs?: LogEntry[]; // Phase 2: Structured logs with metadata
  files_generated: AgentFileGenerated[];
  errors: string[];
  attempt_count?: number;
  last_failed_step?: string | null; // Persisted failure indicator
}
