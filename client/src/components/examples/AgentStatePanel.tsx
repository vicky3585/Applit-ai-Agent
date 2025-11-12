import AgentStatePanel from "../AgentStatePanel";

const mockNodes = [
  { id: "1", name: "Planner", status: "completed" as const },
  { id: "2", name: "Coder", status: "active" as const },
  { id: "3", name: "Tester", status: "pending" as const },
  { id: "4", name: "Auto-Fixer", status: "pending" as const },
];

const mockCheckpoints = [
  {
    id: "1",
    timestamp: new Date(Date.now() - 300000),
    description: "Initial setup completed",
    filesChanged: 3,
  },
  {
    id: "2",
    timestamp: new Date(Date.now() - 120000),
    description: "Added Button component",
    filesChanged: 2,
  },
  {
    id: "3",
    timestamp: new Date(Date.now() - 30000),
    description: "Tests passing",
    filesChanged: 1,
  },
];

export default function AgentStatePanelExample() {
  return (
    <div className="h-screen w-96">
      <AgentStatePanel
        nodes={mockNodes}
        checkpoints={mockCheckpoints}
        currentIteration={2}
        maxIterations={5}
      />
    </div>
  );
}
