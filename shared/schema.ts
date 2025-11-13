import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

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
  status: text("status").notNull(), // 'planning' | 'coding' | 'testing' | 'fixing' | 'completed' | 'error'
  currentNode: text("current_node"),
  metadata: jsonb("metadata"),
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

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
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

export const insertAgentExecutionSchema = createInsertSchema(agentExecutions).pick({
  workspaceId: true,
  status: true,
  currentNode: true,
  metadata: true,
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type InstallPackageRequest = z.infer<typeof installPackageRequestSchema>;
export type InsertWorkspaceSettings = z.infer<typeof insertWorkspaceSettingsSchema>;
export type UpdateWorkspaceSettings = z.infer<typeof updateWorkspaceSettingsSchema>;
export type User = typeof users.$inferSelect;
export type WorkspaceSettings = typeof workspaceSettings.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type File = typeof files.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type AgentExecution = typeof agentExecutions.$inferSelect;
export type Package = typeof packages.$inferSelect;
export type CodeExecution = typeof codeExecutions.$inferSelect;

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
