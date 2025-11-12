import LogsPanel from "../LogsPanel";

const mockLogs = [
  {
    id: "1",
    timestamp: new Date(Date.now() - 300000),
    level: "info" as const,
    message: "Agent started execution",
  },
  {
    id: "2",
    timestamp: new Date(Date.now() - 240000),
    level: "debug" as const,
    message: "Loading workspace files",
  },
  {
    id: "3",
    timestamp: new Date(Date.now() - 180000),
    level: "info" as const,
    message: "Planner node: Analyzing requirements",
  },
  {
    id: "4",
    timestamp: new Date(Date.now() - 120000),
    level: "warning" as const,
    message: "Deprecated API usage detected",
  },
  {
    id: "5",
    timestamp: new Date(Date.now() - 60000),
    level: "info" as const,
    message: "Coder node: Generating component",
  },
  {
    id: "6",
    timestamp: new Date(Date.now() - 30000),
    level: "error" as const,
    message: "Test failed: Button.test.tsx",
  },
  {
    id: "7",
    timestamp: new Date(),
    level: "info" as const,
    message: "Auto-fixer node: Proposing patch",
  },
];

export default function LogsPanelExample() {
  return (
    <div className="h-screen w-96">
      <LogsPanel
        logs={mockLogs}
        onClear={() => console.log("Clear logs")}
      />
    </div>
  );
}
