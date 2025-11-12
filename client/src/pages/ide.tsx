import { useState } from "react";
import TopBar from "@/components/TopBar";
import FileExplorer from "@/components/FileExplorer";
import CodeEditor from "@/components/CodeEditor";
import ChatPanel from "@/components/ChatPanel";
import TerminalPanel from "@/components/TerminalPanel";
import AgentStatePanel from "@/components/AgentStatePanel";
import LogsPanel from "@/components/LogsPanel";
import SettingsModal from "@/components/SettingsModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

//todo: remove mock functionality
const mockFiles = [
  {
    id: "1",
    name: "src",
    type: "folder" as const,
    children: [
      { id: "2", name: "index.tsx", type: "file" as const, language: "typescript" },
      { id: "3", name: "App.tsx", type: "file" as const, language: "typescript" },
      {
        id: "4",
        name: "components",
        type: "folder" as const,
        children: [
          { id: "5", name: "Button.tsx", type: "file" as const },
          { id: "6", name: "Card.tsx", type: "file" as const },
        ],
      },
    ],
  },
  { id: "7", name: "package.json", type: "file" as const },
  { id: "8", name: "tsconfig.json", type: "file" as const },
  { id: "9", name: "README.md", type: "file" as const },
];

const mockTabs = [
  {
    id: "1",
    name: "App.tsx",
    language: "typescript",
    content: `import { useState } from 'react';
import { Button } from './components/Button';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="App">
      <h1>AI Web IDE Demo</h1>
      <p>Counter: {count}</p>
      <Button onClick={() => setCount(count + 1)}>
        Increment
      </Button>
    </div>
  );
}

export default App;`,
    unsaved: false,
  },
  {
    id: "5",
    name: "Button.tsx",
    language: "typescript",
    content: `interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ children, onClick }: ButtonProps) {
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 bg-blue-500 text-white rounded"
    >
      {children}
    </button>
  );
}`,
    unsaved: true,
  },
];

const mockMessages = [
  {
    id: "1",
    role: "user" as const,
    content: "Can you help me create a React component for a todo list?",
    timestamp: new Date(Date.now() - 300000),
  },
  {
    id: "2",
    role: "agent" as const,
    content: `I'll create a todo list component for you. Here's a simple implementation:

\`\`\`typescript
interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

function TodoList() {
  const [todos, setTodos] = useState<Todo[]>([]);
  // ... implementation
}
\`\`\`

Would you like me to add more features?`,
    timestamp: new Date(Date.now() - 240000),
  },
];

const mockTerminalLines = [
  { id: "1", type: "command" as const, content: "npm install" },
  { id: "2", type: "output" as const, content: "added 245 packages in 12s" },
  { id: "3", type: "command" as const, content: "npm run dev" },
  { id: "4", type: "output" as const, content: "  VITE v5.0.0  ready in 432 ms" },
  { id: "5", type: "output" as const, content: "  ➜  Local:   http://localhost:5173/" },
];

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
];

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
];

export default function IDE() {
  const [agentStatus, setAgentStatus] = useState<"idle" | "planning" | "coding" | "testing" | "fixing">("coding");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState("chat");

  return (
    <div className="h-screen flex flex-col bg-background">
      <TopBar
        workspaceName="ai-agent-demo"
        agentStatus={agentStatus}
        onRunAgent={() => setAgentStatus("planning")}
        onPauseAgent={() => setAgentStatus("idle")}
        onResetAgent={() => console.log("Reset agent")}
        onSettings={() => setSettingsOpen(true)}
      />

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={15} minSize={10} maxSize={25}>
          <FileExplorer
            files={mockFiles}
            onFileSelect={(file) => console.log("Selected:", file.name)}
            onNewFile={() => console.log("New file")}
            onNewFolder={() => console.log("New folder")}
          />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-hidden">
              <CodeEditor
                tabs={mockTabs}
                activeTabId="1"
                onTabChange={(id) => console.log("Tab changed:", id)}
                onTabClose={(id) => console.log("Close tab:", id)}
                onContentChange={(id, content) => console.log("Content changed:", id)}
              />
            </div>
            <TerminalPanel
              lines={mockTerminalLines}
              onCommand={(cmd) => console.log("Command:", cmd)}
              onClear={() => console.log("Clear terminal")}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
          <Tabs value={rightPanelTab} onValueChange={setRightPanelTab} className="flex flex-col h-full">
            <TabsList className="w-full justify-start rounded-none border-b h-10 bg-muted/30">
              <TabsTrigger value="chat" className="text-xs" data-testid="tab-chat">
                Chat
              </TabsTrigger>
              <TabsTrigger value="state" className="text-xs" data-testid="tab-state">
                State
              </TabsTrigger>
              <TabsTrigger value="logs" className="text-xs" data-testid="tab-logs">
                Logs
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 m-0 overflow-hidden">
              <ChatPanel
                messages={mockMessages}
                onSendMessage={(content) => console.log("Send:", content)}
                isStreaming={false}
              />
            </TabsContent>
            <TabsContent value="state" className="flex-1 m-0 overflow-hidden">
              <AgentStatePanel
                nodes={mockNodes}
                checkpoints={mockCheckpoints}
                currentIteration={2}
                maxIterations={5}
              />
            </TabsContent>
            <TabsContent value="logs" className="flex-1 m-0 overflow-hidden">
              <LogsPanel
                logs={mockLogs}
                onClear={() => console.log("Clear logs")}
              />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
