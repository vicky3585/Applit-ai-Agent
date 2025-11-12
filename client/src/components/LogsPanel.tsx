import { useState } from "react";
import { FileText, Filter, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface LogEntry {
  id: string;
  timestamp: Date;
  level: "debug" | "info" | "warning" | "error";
  message: string;
}

interface LogsPanelProps {
  logs?: LogEntry[];
  onClear?: () => void;
}

export default function LogsPanel({ logs = [], onClear }: LogsPanelProps) {
  const [filter, setFilter] = useState<string>("all");

  const filteredLogs = logs.filter((log) => {
    if (filter === "all") return true;
    return log.level === filter;
  });

  const getLevelColor = (level: LogEntry["level"]) => {
    switch (level) {
      case "error":
        return "bg-destructive/10 text-destructive";
      case "warning":
        return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
      case "info":
        return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="h-10 border-b flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Logs</span>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-28 h-7" data-testid="select-log-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={onClear}
            data-testid="button-clear-logs"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <p className="text-sm">No logs to display</p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-2 p-2 rounded-md hover-elevate font-mono text-xs"
                  data-testid={`log-entry-${log.id}`}
                >
                  <span className="text-muted-foreground whitespace-nowrap w-20">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <Badge className={`${getLevelColor(log.level)} text-xs w-16 justify-center`}>
                    {log.level.toUpperCase()}
                  </Badge>
                  <span className="flex-1">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
