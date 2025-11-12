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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type File = typeof files.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type AgentExecution = typeof agentExecutions.$inferSelect;
