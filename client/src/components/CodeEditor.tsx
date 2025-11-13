import { useState, useEffect, useRef } from "react";
import { X, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import Editor, { Monaco } from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { MonacoBinding } from "y-monaco";
import type { editor } from "monaco-editor";

interface EditorTab {
  id: string;
  name: string;
  content: string;
  language?: string;
  unsaved?: boolean;
}

interface CodeEditorProps {
  tabs?: EditorTab[];
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onContentChange?: (tabId: string, content: string) => void;
  workspaceId?: string;
  userId?: string;
  username?: string;
}

// Persist Y.Doc instances per file to avoid recreation
const ydocCache = new Map<string, Y.Doc>();
const providerCache = new Map<string, WebsocketProvider>();

export default function CodeEditor({
  tabs = [],
  activeTabId,
  onTabChange,
  onTabClose,
  onContentChange,
  workspaceId = "default",
  userId = "user1",
  username = "Anonymous",
}: CodeEditorProps) {
  const [activeTab, setActiveTab] = useState(activeTabId || tabs[0]?.id);
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    onTabChange?.(tabId);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    
    // Cleanup provider for closed tab
    const closedTab = tabs.find(t => t.id === tabId);
    if (closedTab) {
      const docKey = `${workspaceId}:${closedTab.name}`;
      const provider = providerCache.get(docKey);
      if (provider) {
        provider.awareness.setLocalState(null);
        provider.destroy();
        providerCache.delete(docKey);
      }
      
      const ydoc = ydocCache.get(docKey);
      if (ydoc) {
        ydoc.destroy();
        ydocCache.delete(docKey);
      }
    }
    
    onTabClose?.(tabId);
  };

  const currentTab = tabs.find((tab) => tab.id === activeTab);

  // Initialize Y-Monaco binding for collaborative editing
  useEffect(() => {
    if (!currentTab || !editorRef.current || !monacoInstance) return;

    const docKey = `${workspaceId}:${currentTab.name}`;

    // Clean up previous binding
    if (bindingRef.current) {
      bindingRef.current.destroy();
      bindingRef.current = null;
    }

    // Get or create Y.Doc for this file
    let ydoc = ydocCache.get(docKey);
    if (!ydoc) {
      ydoc = new Y.Doc();
      ydocCache.set(docKey, ydoc);
    }

    // Get text type for collaborative editing
    const ytext = ydoc.getText("monaco");

    // Initialize with current content if empty
    if (ytext.length === 0 && currentTab.content) {
      ytext.insert(0, currentTab.content);
    }

    // Get or create WebSocket provider
    let provider = providerCache.get(docKey);
    const isNewProvider = !provider;
    
    if (!provider) {
      // Construct WebSocket URL - y-websocket uses standard pattern
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const baseUrl = `${protocol}//${window.location.host}`;
      
      // y-websocket will construct: baseUrl/roomname
      // We use a custom roomname that encodes workspace and document info
      const roomname = `yjs/${workspaceId}/${currentTab.name}`;
      
      // Pass user info via params
      const params = {
        userId,
        username,
      };

      provider = new WebsocketProvider(baseUrl, roomname, ydoc, {
        connect: true,
        WebSocketPolyfill: WebSocket,
        params,
      });
      providerCache.set(docKey, provider);

      // Log connection status
      provider.on("status", (event: any) => {
        console.log(`[Y-Monaco] ${currentTab.name} connection:`, event.status);
      });

      provider.on("sync", (isSynced: boolean) => {
        console.log(`[Y-Monaco] ${currentTab.name} sync:`, isSynced ? "synced" : "syncing");
      });
    }

    // CRITICAL: Set/restore awareness when tab becomes active (for both new and cached providers)
    provider.awareness.setLocalStateField("user", {
      name: username,
      color: getUserColor(userId),
      userId: userId,
    });

    // Create Monaco binding
    const model = editorRef.current.getModel();
    if (model) {
      const binding = new MonacoBinding(
        ytext,
        model,
        new Set([editorRef.current]),
        provider.awareness
      );
      bindingRef.current = binding;

      // Listen for changes to update parent component
      const updateHandler = () => {
        const content = ytext.toString();
        onContentChange?.(currentTab.id, content);
      };
      ytext.observe(updateHandler);

      // Cleanup on tab change - CRITICAL: Clear awareness to prevent ghost cursors
      return () => {
        ytext.unobserve(updateHandler);
        if (bindingRef.current) {
          bindingRef.current.destroy();
          bindingRef.current = null;
        }
        
        // Clear awareness state for this tab's provider
        const tabProvider = providerCache.get(docKey);
        if (tabProvider) {
          tabProvider.awareness.setLocalState(null);
        }
      };
    }
  }, [currentTab?.name, editorRef.current, monacoInstance, workspaceId, userId, username, onContentChange]);

  // Cleanup when component unmounts (user navigates away)
  useEffect(() => {
    return () => {
      // Clear awareness state for all providers
      for (const provider of Array.from(providerCache.values())) {
        provider.awareness.setLocalState(null);
      }
    };
  }, []);

  function handleEditorDidMount(editor: editor.IStandaloneCodeEditor, monaco: Monaco) {
    editorRef.current = editor;
    setMonacoInstance(monaco);

    // Configure Monaco editor
    editor.updateOptions({
      fontSize: 14,
      fontFamily: "JetBrains Mono, Consolas, monospace",
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: "on",
    });
  }

  // Generate consistent color for each user
  function getUserColor(userId: string): string {
    const colors = [
      "#FF6B6B", // Red
      "#4ECDC4", // Teal
      "#45B7D1", // Blue
      "#FFA07A", // Orange
      "#98D8C8", // Green
      "#F7DC6F", // Yellow
      "#BB8FCE", // Purple
      "#85C1E2", // Light Blue
    ];

    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  }

  return (
    <div className="flex-1 flex flex-col bg-background h-full">
      {/* Tab Bar */}
      <div className="h-10 border-b bg-muted/30 flex items-center overflow-x-auto">
        <ScrollArea className="flex-1">
          <div className="flex">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`
                  group flex items-center gap-2 px-4 h-10 border-r cursor-pointer min-w-32
                  ${activeTab === tab.id ? "bg-background" : "hover-elevate"}
                `}
                onClick={() => handleTabClick(tab.id)}
                data-testid={`tab-${tab.id}`}
              >
                <span className="text-sm truncate flex-1">
                  {tab.name}
                  {tab.unsaved && <span className="text-orange-500 ml-1">•</span>}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-5 h-5 opacity-0 group-hover:opacity-100"
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  data-testid={`button-close-tab-${tab.id}`}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
        <Button size="icon" variant="ghost" className="w-10 h-10 shrink-0">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 relative">
        {currentTab ? (
          <Editor
            key={currentTab.id}
            height="100%"
            language={currentTab.language || "plaintext"}
            value={currentTab.content}
            onMount={handleEditorDidMount}
            theme="vs-dark"
            options={{
              readOnly: false,
              automaticLayout: true,
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No file open</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Cleanup function for when component unmounts completely
export function cleanupYjsDocs() {
  for (const provider of Array.from(providerCache.values())) {
    provider.destroy();
  }
  for (const ydoc of Array.from(ydocCache.values())) {
    ydoc.destroy();
  }
  providerCache.clear();
  ydocCache.clear();
}
