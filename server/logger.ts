/**
 * Structured Logging Utility (Phase 2)
 * 
 * Provides consistent structured logging across all autonomous workflow components:
 * - Package installer
 * - Dev server manager
 * - Agent orchestrator
 * - Python agent workflow
 * 
 * Features:
 * - Automatic timestamping
 * - Phase-level tracking
 * - Log level enforcement
 * - Metadata enrichment
 * - Legacy log conversion
 */

import { nanoid } from "nanoid";
import type { LogEntry, LogLevel, LogPhase } from "@shared/schema";

export interface CreateLogOptions {
  level: LogLevel;
  phase: LogPhase;
  message: string;
  metadata?: Record<string, any>;
}

export class StructuredLogger {
  /**
   * Create a structured log entry with automatic ID and timestamp
   */
  static createLog(options: CreateLogOptions): LogEntry {
    return {
      id: nanoid(),
      timestamp: Date.now(),
      level: options.level,
      phase: options.phase,
      message: options.message,
      metadata: options.metadata,
    };
  }

  /**
   * Create an info log
   */
  static info(phase: LogPhase, message: string, metadata?: Record<string, any>): LogEntry {
    return this.createLog({ level: "info", phase, message, metadata });
  }

  /**
   * Create a success log
   */
  static success(phase: LogPhase, message: string, metadata?: Record<string, any>): LogEntry {
    return this.createLog({ level: "success", phase, message, metadata });
  }

  /**
   * Create a warning log
   */
  static warn(phase: LogPhase, message: string, metadata?: Record<string, any>): LogEntry {
    return this.createLog({ level: "warn", phase, message, metadata });
  }

  /**
   * Create an error log
   */
  static error(phase: LogPhase, message: string, metadata?: Record<string, any>): LogEntry {
    return this.createLog({ level: "error", phase, message, metadata });
  }

  /**
   * Create a debug log
   */
  static debug(phase: LogPhase, message: string, metadata?: Record<string, any>): LogEntry {
    return this.createLog({ level: "debug", phase, message, metadata });
  }

  /**
   * Convert legacy string log to structured log entry
   * Attempts to infer phase and level from message content
   */
  static fromLegacyLog(message: string, defaultPhase: LogPhase = "system"): LogEntry {
    // Infer level from message content
    let level: LogLevel = "info";
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes("error") || lowerMessage.includes("failed")) {
      level = "error";
    } else if (lowerMessage.includes("warn") || lowerMessage.includes("warning")) {
      level = "warn";
    } else if (lowerMessage.includes("success") || lowerMessage.includes("complete")) {
      level = "success";
    } else if (lowerMessage.includes("debug")) {
      level = "debug";
    }

    // Infer phase from message content
    let phase: LogPhase = defaultPhase;
    if (lowerMessage.includes("[planner]") || lowerMessage.includes("planning")) {
      phase = "planning";
    } else if (lowerMessage.includes("[coder]") || lowerMessage.includes("coding")) {
      phase = "coding";
    } else if (lowerMessage.includes("[tester]") || lowerMessage.includes("testing")) {
      phase = "testing";
    } else if (lowerMessage.includes("[fixer]") || lowerMessage.includes("fixing")) {
      phase = "fixing";
    } else if (lowerMessage.includes("[package") || lowerMessage.includes("install")) {
      phase = "package_install";
    } else if (lowerMessage.includes("[dev server]") || lowerMessage.includes("server")) {
      phase = "dev_server";
    }

    return {
      id: nanoid(),
      timestamp: Date.now(),
      level,
      phase,
      message,
      metadata: { legacy: true },
    };
  }

  /**
   * Convert array of legacy string logs to structured logs
   */
  static fromLegacyLogs(logs: string[], defaultPhase: LogPhase = "system"): LogEntry[] {
    return logs.map(log => this.fromLegacyLog(log, defaultPhase));
  }

  /**
   * Format log entry for console output (for debugging)
   */
  static format(log: LogEntry): string {
    const timestamp = new Date(log.timestamp).toISOString();
    const prefix = `[${timestamp}] [${log.level.toUpperCase()}] [${log.phase}]`;
    const metadata = log.metadata ? ` ${JSON.stringify(log.metadata)}` : "";
    return `${prefix} ${log.message}${metadata}`;
  }

  /**
   * Group logs by phase
   */
  static groupByPhase(logs: LogEntry[]): Record<LogPhase, LogEntry[]> {
    const grouped: Record<LogPhase, LogEntry[]> = {
      system: [],
      planning: [],
      coding: [],
      testing: [],
      fixing: [],
      package_install: [],
      command_execution: [],
      dev_server: [],
      complete: [],
    };

    for (const log of logs) {
      grouped[log.phase].push(log);
    }

    return grouped;
  }

  /**
   * Filter logs by level
   */
  static filterByLevel(logs: LogEntry[], levels: LogLevel[]): LogEntry[] {
    return logs.filter(log => levels.includes(log.level));
  }

  /**
   * Filter logs by phase
   */
  static filterByPhase(logs: LogEntry[], phases: LogPhase[]): LogEntry[] {
    return logs.filter(log => phases.includes(log.phase));
  }

  /**
   * Search logs by keyword
   */
  static search(logs: LogEntry[], keyword: string): LogEntry[] {
    const lowerKeyword = keyword.toLowerCase();
    return logs.filter(log => 
      log.message.toLowerCase().includes(lowerKeyword) ||
      JSON.stringify(log.metadata || {}).toLowerCase().includes(lowerKeyword)
    );
  }

  /**
   * Get logs in time range
   */
  static inTimeRange(logs: LogEntry[], startTime: number, endTime: number): LogEntry[] {
    return logs.filter(log => log.timestamp >= startTime && log.timestamp <= endTime);
  }

  /**
   * Sort logs by timestamp (ascending)
   */
  static sortByTime(logs: LogEntry[], ascending = true): LogEntry[] {
    return [...logs].sort((a, b) => {
      return ascending ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
    });
  }
}

// Convenience exports for direct usage
export const createLog = StructuredLogger.createLog.bind(StructuredLogger);
export const logInfo = StructuredLogger.info.bind(StructuredLogger);
export const logSuccess = StructuredLogger.success.bind(StructuredLogger);
export const logWarn = StructuredLogger.warn.bind(StructuredLogger);
export const logError = StructuredLogger.error.bind(StructuredLogger);
export const logDebug = StructuredLogger.debug.bind(StructuredLogger);
