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
  logs: jsonb("logs").notNull().default(sql`'[]'::jsonb`), // Array of log messages
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
  extendedThinking: text("extended_thinking").default("false"),
  localFirst: text("local_first").default("false"),
  autoFix: text("auto_fix").default("true"),
  maxIterations: text("max_iterations").default("5"),
  fontSize: text("font_size").default("14"),
  autoSave: text("auto_save").default("true"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

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
    .email("Invalid email address")
    .transform(val => val.trim().toLowerCase())
    .optional(),
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
export type Collaborator = typeof collaborators.$inferSelect;
export type YjsDocument = typeof yjsDocuments.$inferSelect;
export type CollaborationChatMessage = typeof collaborationChatMessages.$inferSelect;

// Agent Workflow State types (from Python agent service)
export type AgentStep = "idle" | "planning" | "coding" | "testing" | "fixing" | "complete" | "failed";

export interface AgentFileGenerated {
  path: string;
  content: string;
  language?: string;
}

export interface AgentWorkflowState {
  status: "idle" | "processing" | "complete" | "failed";
  current_step: AgentStep;
  progress: number; // 0.0 to 1.0
  logs: string[];
  files_generated: AgentFileGenerated[];
  errors: string[];
  attempt_count?: number;
}
