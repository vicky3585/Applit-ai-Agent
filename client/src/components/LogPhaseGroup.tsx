/**
 * LogPhaseGroup Component (Phase 2)
 * Groups logs by workflow phase with collapsible sections
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { LogEntry as LogEntryType, LogPhase } from "@shared/schema";
import { LogEntry } from "./LogEntry";
import { cn } from "@/lib/utils";

interface LogPhaseGroupProps {
  phase: LogPhase;
  logs: LogEntryType[];
  defaultExpanded?: boolean;
}

const phaseLabels: Record<LogPhase, string> = {
  system: "System",
  planning: "Planning",
  coding: "Coding",
  testing: "Testing",
  fixing: "Fixing",
  package_install: "Package Installation",
  dev_server: "Dev Server",
  complete: "Complete",
};

const phaseColors: Record<LogPhase, string> = {
  system: "text-gray-600 dark:text-gray-400",
  planning: "text-blue-600 dark:text-blue-400",
  coding: "text-purple-600 dark:text-purple-400",
  testing: "text-yellow-600 dark:text-yellow-400",
  fixing: "text-orange-600 dark:text-orange-400",
  package_install: "text-green-600 dark:text-green-400",
  dev_server: "text-cyan-600 dark:text-cyan-400",
  complete: "text-emerald-600 dark:text-emerald-400",
};

export function LogPhaseGroup({ phase, logs, defaultExpanded = true }: LogPhaseGroupProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (logs.length === 0) {
    return null;
  }

  const errorCount = logs.filter(log => log.level === "error").length;
  const warnCount = logs.filter(log => log.level === "warn").length;

  return (
    <div className="space-y-1" data-testid={`log-phase-group-${phase}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-2 rounded-md hover-elevate active-elevate-2 text-sm font-medium"
        data-testid={`button-toggle-phase-${phase}`}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          
          <span className={cn("font-semibold", phaseColors[phase])}>
            {phaseLabels[phase]}
          </span>
          
          <span className="text-xs text-muted-foreground">
            ({logs.length} {logs.length === 1 ? "entry" : "entries"})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-sm bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-400">
              {errorCount} error{errorCount !== 1 ? "s" : ""}
            </span>
          )}
          {warnCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-sm bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-400">
              {warnCount} warning{warnCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="space-y-1 pl-6" data-testid={`log-phase-entries-${phase}`}>
          {logs.map((log) => (
            <LogEntry key={log.id} entry={log} />
          ))}
        </div>
      )}
    </div>
  );
}
