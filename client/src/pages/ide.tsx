import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { WebSocketClient } from "@/lib/websocket";
import { apiRequest, queryClient } from "@/lib/queryClient";

const WORKSPACE_ID = "default-workspace";

interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  path?: string;
  children?: FileNode[];
}

export default function IDE() {
  const [agentStatus, setAgentStatus] = useState<"idle" | "planning" | "coding" | "testing" | "fixing">("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState("chat");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [openTabs, setOpenTabs] = useState<any[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const wsRef = useRef<WebSocketClient | null>(null);

  // Fetch files
  const { data: files = [] } = useQuery<any[]>({
    queryKey: [`/api/workspaces/${WORKSPACE_ID}/files`],
  });

  // Fetch chat messages
  useEffect(() => {
    fetch(`/api/workspaces/${WORKSPACE_ID}/chat`)
      .then((res) => res.json())
      .then((messages) => setChatMessages(messages));
  }, []);

  // WebSocket connection
  useEffect(() => {
    const ws = new WebSocketClient(WORKSPACE_ID);
    wsRef.current = ws;

    ws.on("agent_state", (data: any) => {
      setAgentStatus(data.status);
      addLog("info", `Agent state: ${data.status}`);
    });

    ws.on("chat_message", (data: any) => {
      setChatMessages((prev) => [...prev, data]);
    });

    ws.on("chat_stream", (data: any) => {
      setStreamingMessage((prev) => prev + data.content);
    });

    ws.on("chat_complete", (data: any) => {
      setChatMessages((prev) => [...prev, data]);
      setStreamingMessage("");
      setIsStreaming(false);
    });

    return () => {
      ws.disconnect();
    };
  }, []);

  const addLog = (level: string, message: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        timestamp: new Date(),
        level,
        message,
      },
    ]);
  };

  const sendChatMessage = (content: string) => {
    if (!wsRef.current) return;

    setIsStreaming(true);
    setStreamingMessage("");
    
    wsRef.current.send({
      type: "chat_message",
      workspaceId: WORKSPACE_ID,
      content,
    });
  };

  const updateFileMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      return apiRequest("PUT", `/api/files/${id}`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${WORKSPACE_ID}/files`] });
    },
  });

  const handleFileSelect = async (file: any) => {
    if (file.type === "folder") return;

    const fullFile = files.find((f: any) => f.path === file.path);
    if (!fullFile) return;

    // Check if already open
    const existingTab = openTabs.find((tab) => tab.id === fullFile.id);
    if (existingTab) {
      setActiveTabId(fullFile.id);
      return;
    }

    // Add to open tabs
    const newTab = {
      id: fullFile.id,
      name: fullFile.path.split("/").pop(),
      content: fullFile.content,
      language: fullFile.language,
      unsaved: false,
    };

    setOpenTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleTabClose = (tabId: string) => {
    setOpenTabs((prev) => prev.filter((tab) => tab.id !== tabId));
    if (activeTabId === tabId) {
      const remaining = openTabs.filter((tab) => tab.id !== tabId);
      setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const handleContentChange = (tabId: string, content: string) => {
    setOpenTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId ? { ...tab, content, unsaved: true } : tab
      )
    );

    // Debounce save
    const tab = openTabs.find((t) => t.id === tabId);
    if (tab) {
      updateFileMutation.mutate({ id: tabId, content });
    }
  };

  const handleTerminalCommand = (command: string) => {
    setTerminalLines((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: "command",
        content: command,
      },
      {
        id: (Date.now() + 1).toString(),
        type: "output",
        content: "Command execution not yet implemented",
      },
    ]);
  };

  // Build file tree
  const buildFileTree = (files: any[]): FileNode[] => {
    const tree: FileNode[] = [];
    const pathMap = new Map<string, FileNode>();

    files.forEach((file) => {
      const parts = file.path.split("/");
      let currentPath = "";

      parts.forEach((part: string, index: number) => {
        const isLast = index === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (!pathMap.has(currentPath)) {
          const node: FileNode = {
            id: isLast ? file.id : currentPath,
            name: part,
            type: isLast ? "file" : "folder",
            path: isLast ? file.path : undefined,
            children: isLast ? undefined : [],
          };

          pathMap.set(currentPath, node);

          // Add to parent or root
          if (index === 0) {
            tree.push(node);
          } else {
            const parentPath = parts.slice(0, index).join("/");
            const parent = pathMap.get(parentPath);
            if (parent && parent.children) {
              parent.children.push(node);
            }
          }
        }
      });
    });

    return tree;
  };

  const fileTree = buildFileTree(files);

  return (
    <div className="h-screen flex flex-col bg-background">
      <TopBar
        workspaceName="my-project"
        agentStatus={agentStatus}
        onRunAgent={() => console.log("Run agent")}
        onPauseAgent={() => console.log("Pause agent")}
        onResetAgent={() => console.log("Reset agent")}
        onSettings={() => setSettingsOpen(true)}
      />

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={15} minSize={10} maxSize={25}>
          <FileExplorer
            files={fileTree}
            onFileSelect={handleFileSelect}
            onNewFile={() => console.log("New file")}
            onNewFolder={() => console.log("New folder")}
          />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="flex flex-col h-full">
            <div className="flex-1 overflow-hidden">
              <CodeEditor
                tabs={openTabs}
                activeTabId={activeTabId || undefined}
                onTabChange={setActiveTabId}
                onTabClose={handleTabClose}
                onContentChange={handleContentChange}
              />
            </div>
            <TerminalPanel
              lines={terminalLines}
              onCommand={handleTerminalCommand}
              onClear={() => setTerminalLines([])}
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
                messages={chatMessages.map((msg) => ({
                  ...msg,
                  timestamp: new Date(msg.createdAt || msg.timestamp),
                }))}
                onSendMessage={sendChatMessage}
                isStreaming={isStreaming}
              />
            </TabsContent>
            <TabsContent value="state" className="flex-1 m-0 overflow-hidden">
              <AgentStatePanel
                nodes={[
                  { id: "1", name: "Planner", status: "completed" },
                  { id: "2", name: "Coder", status: agentStatus === "coding" ? "active" : "pending" },
                  { id: "3", name: "Tester", status: "pending" },
                  { id: "4", name: "Auto-Fixer", status: "pending" },
                ]}
                checkpoints={[]}
                currentIteration={0}
                maxIterations={5}
              />
            </TabsContent>
            <TabsContent value="logs" className="flex-1 m-0 overflow-hidden">
              <LogsPanel logs={logs} onClear={() => setLogs([])} />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
