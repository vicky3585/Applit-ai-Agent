import TerminalPanel from "../TerminalPanel";

const mockLines = [
  { id: "1", type: "command" as const, content: "npm install" },
  { id: "2", type: "output" as const, content: "added 245 packages in 12s" },
  { id: "3", type: "command" as const, content: "npm run dev" },
  { id: "4", type: "output" as const, content: "  VITE v5.0.0  ready in 432 ms" },
  { id: "5", type: "output" as const, content: "  ➜  Local:   http://localhost:5173/" },
  { id: "6", type: "command" as const, content: "npm test" },
  { id: "7", type: "error" as const, content: "Error: Test suite failed to run" },
];

export default function TerminalPanelExample() {
  return (
    <TerminalPanel
      lines={mockLines}
      onCommand={(cmd) => console.log("Command:", cmd)}
      onClear={() => console.log("Clear terminal")}
    />
  );
}
