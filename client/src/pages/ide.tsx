import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import TopBar from "@/components/TopBar";
import FileExplorer from "@/components/FileExplorer";
import CodeEditor from "@/components/CodeEditor";
import CodeServerFrame from "@/components/CodeServerFrame";
import PreviewPane from "@/components/PreviewPane";
import ChatPanel from "@/components/ChatPanel";
import TerminalPanel from "@/components/TerminalPanel";
import AgentStatePanel from "@/components/AgentStatePanel";
import LogsPanel from "@/components/LogsPanel";
import FilesChangedPanel from "@/components/FilesChangedPanel";
import { GitPanel } from "@/components/GitPanel";
import { CodeExecutionPanel } from "@/components/CodeExecutionPanel";
import { PackageInstallation } from "@/components/PackageInstallation";
import SettingsModal from "@/components/SettingsModal";
import PackageManagerModal from "@/components/PackageManagerModal";
import TemplateSelectorModal from "@/components/TemplateSelectorModal";
import { GitHubBrowserModal } from "@/components/GitHubBrowserModal";
import { CommandPalette } from "@/components/CommandPalette";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useIDECommands } from "@/hooks/use-ide-commands";
import { useFilePresence } from "@/hooks/use-file-presence";
import { WorkspaceAwarenessProvider, useWorkspaceAwareness } from "@/providers/WorkspaceAwarenessProvider";
import { AuthProvider, useAuth, useAuthenticatedUser } from "@/providers/AuthProvider";
import UserListPanel from "@/components/UserListPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { WebSocketClient } from "@/lib/websocket";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AgentWorkflowState, AgentStep } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, Package, Folder, FileCode, Play, 
  LayoutGrid, Terminal, MessageSquare, GitBranch,
  Code, Eye, Layers, Save
} from "lucide-react";

interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  path?: string;
  children?: FileNode[];
}

// Centralized agent status derivation helper
function deriveAgentStatus(workflowState: AgentWorkflowState | null): AgentStep {
  if (!workflowState) return "idle";
  if (workflowState.status === "complete") return "complete";
  if (workflowState.status === "failed") return "failed";
  return workflowState.current_step;
}

function IDEContent({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const user = useAuthenticatedUser(); // Get authenticated user (guaranteed non-null)
  const [agentStatus, setAgentStatus] = useState<AgentStep>("idle");
  
  // Workspace-level awareness (Task 7.9: Single source of truth for presence)
  const { users: workspaceUsers, setLocalPresence } = useWorkspaceAwareness();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [packagesOpen, setPackagesOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [githubBrowserOpen, setGithubBrowserOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState("chat");
  const [editorView, setEditorView] = useState<"custom" | "code-server" | "preview" | "split">("custom");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [openTabs, setOpenTabs] = useState<any[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [terminalLines, setTerminalLines] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameFile, setRenameFile] = useState<any | null>(null);
  const [renamePath, setRenamePath] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteFile, setDeleteFile] = useState<any | null>(null);
  const wsRef = useRef<WebSocketClient | null>(null);
  
  // Agent workflow state
  const [agentWorkflow, setAgentWorkflow] = useState<AgentWorkflowState | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const completionHandledRef = useRef<boolean>(false); // ✅ Prevent duplicate completion calls
  
  // Package installation state
  const [packageInstallations, setPackageInstallations] = useState<any[]>([]);
  
  // File presence state (Task 7.8: Multiplayer presence indicators)
  const { filePresence, handleAwarenessUpdate, clearPresenceForFile } = useFilePresence();

  // Follow mode state (Task 7.10: Follow user's view and cursor)
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);

  // Fetch files (with error handling for deleted workspaces)
  const { data: files = [], error: filesError } = useQuery<any[]>({
    queryKey: [`/api/workspaces/${workspaceId}/files`],
    retry: false, // Don't retry on 404s
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  // Redirect to dashboard if workspace doesn't exist (404)
  const [, navigate] = useLocation();
  useEffect(() => {
    if (filesError) {
      // Check HTTP status instead of error message substring
      const status = (filesError as any)?.response?.status || (filesError as any)?.status;
      if (status === 404) {
        toast({
          title: "Workspace not found",
          description: "This workspace may have been deleted. Redirecting to dashboard...",
          variant: "destructive",
        });
        setTimeout(() => {
          navigate("/dashboard");
        }, 1500);
      }
    }
  }, [filesError, toast, navigate]);

  // Fetch chat messages
  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/chat`)
      .then((res) => res.json())
      .then((messages) => setChatMessages(messages));
  }, [workspaceId]);

  // Poll agent status when generating
  useEffect(() => {
    if (!isGenerating) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    let failureCount = 0;
    const MAX_FAILURES = 5;

    // Start polling every 2 seconds
    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/agent/status`);
        if (response.ok) {
          const status: AgentWorkflowState = await response.json();
          failureCount = 0; // Reset on success
          setAgentWorkflow(status);
          setAgentStatus(deriveAgentStatus(status)); // ✅ Use centralized helper

          // Stop polling if complete or failed (with deduplication)
          if (status.status === "complete" || status.status === "failed") {
            if (!completionHandledRef.current) {
              completionHandledRef.current = true;
              handleWorkflowCompletion(status);
            }
          }
        } else {
          failureCount++;
          if (failureCount >= MAX_FAILURES) {
            handlePollingFailure();
          }
        }
      } catch (error) {
        console.error("Failed to poll agent status:", error);
        failureCount++;
        if (failureCount >= MAX_FAILURES) {
          handlePollingFailure();
        }
      }
    };

    // Poll immediately, then every 2 seconds
    pollStatus();
    pollingIntervalRef.current = setInterval(pollStatus, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isGenerating, toast]);

  // Task 7.9: Update workspace presence when active tab changes
  // Include human-readable filename for display in UserListPanel
  useEffect(() => {
    if (activeTabId) {
      const activeTab = openTabs.find(tab => tab.id === activeTabId);
      setLocalPresence({ 
        activeFile: activeTabId,
        activeFileName: activeTab?.name || null
      });
    }
  }, [activeTabId, openTabs, setLocalPresence]);

  const handleWorkflowCompletion = (status: AgentWorkflowState) => {
    setIsGenerating(false);
    setAgentStatus(deriveAgentStatus(status)); // ✅ Persist terminal state (complete/failed)
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Show completion toast
    if (status.status === "complete") {
      toast({
        title: "Generation Complete",
        description: `${status.files_generated.length} file(s) created successfully.`,
      });
      addLog("success", `Agent completed: ${status.files_generated.length} files generated`);
    } else {
      toast({
        title: "Generation Failed",
        description: status.errors[0] || "An error occurred during generation.",
        variant: "destructive",
      });
      addLog("error", `Agent failed: ${status.errors[0] || "Unknown error"}`);
    }

    // Invalidate files query to refresh file list
    queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/files`] });
  };

  const handlePollingFailure = () => {
    setIsGenerating(false);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    // ✅ Don't fabricate workflow failure - just reset to idle with connection error
    setAgentStatus("idle");
    
    toast({
      title: "Connection Lost",
      description: "Lost connection to agent service. The workflow may still be running.",
      variant: "destructive",
    });
    addLog("error", "Connection lost - unable to get agent status after multiple attempts");
  };

  // WebSocket connection
  useEffect(() => {
    const ws = new WebSocketClient(workspaceId);
    wsRef.current = ws;

    ws.on("agent_state", (data: any) => {
      // ✅ Use centralized helper (accepts string and maps to AgentStep)
      const workflow: AgentWorkflowState = {
        status: data.status === "complete" || data.status === "failed" ? data.status : "processing",
        current_step: data.status as AgentStep,
        progress: 0.0,
        logs: [],
        files_generated: [],
        errors: [],
      };
      setAgentStatus(deriveAgentStatus(workflow));
      addLog("info", `Agent state: ${data.status}`);
    });

    ws.on("agent_workflow", (data: AgentWorkflowState) => {
      setAgentWorkflow(data);
      setAgentStatus(deriveAgentStatus(data)); // ✅ Use centralized helper
      
      // Handle completion via WebSocket (with deduplication)
      if (data.status === "complete" || data.status === "failed") {
        if (!completionHandledRef.current) {
          completionHandledRef.current = true;
          handleWorkflowCompletion(data);
        }
      }
    });

    ws.on("files_updated", (data: any) => {
      // Refresh file list when agent generates new files
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/files`] });
      addLog("info", `Files updated: ${data.fileCount} file(s) generated`);
    });

    ws.on("chat_message", (data: any) => {
      setChatMessages((prev) => [...prev, data]);
    });

    ws.on("chat_stream", (data: any) => {
      setStreamingMessage((prev) => prev + data.content);
      setIsStreaming(true);
    });

    ws.on("chat_complete", (data: any) => {
      // Add the complete message with all streamed logs
      const completeMessage = {
        ...data,
        content: streamingMessage || data.content,
      };
      setChatMessages((prev) => [...prev, completeMessage]);
      setStreamingMessage("");
      setIsStreaming(false);
    });

    ws.on("terminal_output", (data: { chunk: string }) => {
      setTerminalLines((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.type === "output") {
          // Append to existing output line
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + data.chunk },
          ];
        } else {
          // Create new output line
          return [
            ...prev,
            {
              id: Date.now().toString(),
              type: "output",
              content: data.chunk,
            },
          ];
        }
      });
    });

    ws.on("terminal_complete", (data: { success: boolean; exitCode?: number }) => {
      if (!data.success && data.exitCode !== 0) {
        setTerminalLines((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            type: "error",
            content: `Command exited with code ${data.exitCode}`,
          },
        ]);
      }
    });

    ws.on("terminal_error", (data: { message: string }) => {
      setTerminalLines((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          type: "error",
          content: data.message,
        },
      ]);
    });

    // Package installation event listeners
    ws.on("package_install_start", (data: any) => {
      const newInstall = {
        id: data.id,
        packageManager: data.packageManager,
        packages: data.packages,
        status: "installing",
        logs: [],
        startedAt: new Date(),
      };
      setPackageInstallations((prev) => [newInstall, ...prev]);
      addLog("info", `Installing ${data.packageManager} packages: ${data.packages.join(", ")}`);
    });

    ws.on("package_install_log", (data: any) => {
      setPackageInstallations((prev) =>
        prev.map((install) =>
          install.id === data.id
            ? { ...install, logs: [...install.logs, data.log] }
            : install
        )
      );
    });

    ws.on("package_install_complete", (data: any) => {
      setPackageInstallations((prev) =>
        prev.map((install) =>
          install.id === data.id
            ? {
                ...install,
                status: data.success ? "completed" : "failed",
                completedAt: new Date(),
                error: data.error,
              }
            : install
        )
      );
      
      if (data.success) {
        addLog("success", `Package installation completed successfully`);
      } else {
        addLog("error", `Package installation failed: ${data.error || "Unknown error"}`);
      }
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
      workspaceId: workspaceId,
      content,
    });
  };

  const generateWithAIMutation = useMutation({
    mutationFn: async (prompt: string) => {
      return apiRequest("POST", `/api/workspaces/${workspaceId}/agent/generate`, { prompt });
    },
    onSuccess: () => {
      // Clear previous workflow state and completion flag
      setAgentWorkflow(null);
      completionHandledRef.current = false; // ✅ Reset completion flag for new run
      
      // Immediately set processing state (don't wait for first poll)
      const initialWorkflow: AgentWorkflowState = {
        status: "processing",
        current_step: "planning",
        progress: 0.0,
        logs: ["Starting AI agent workflow..."],
        files_generated: [],
        errors: [],
      };
      setAgentWorkflow(initialWorkflow);
      setAgentStatus(deriveAgentStatus(initialWorkflow)); // ✅ Use centralized helper
      setIsGenerating(true);
      setRightPanelTab("chat"); // Switch to chat tab to show workflow
      addLog("info", "Agent generation started");
    },
    onError: (error: any) => {
      const errorMsg = error.response?.data?.error || error.message || "Failed to start agent generation";
      toast({
        title: "Generation Failed",
        description: errorMsg,
        variant: "destructive",
      });
      addLog("error", `Agent generation error: ${errorMsg}`);
    },
  });

  const handleGenerateWithAI = (prompt: string) => {
    generateWithAIMutation.mutate(prompt);
  };

  const handleFileClickFromWorkflow = async (path: string) => {
    // Find file by path and open it
    const file = files.find((f: any) => f.path === path);
    if (file) {
      await handleFileSelect(file);
    }
  };

  const createFileMutation = useMutation({
    mutationFn: async ({ path, content }: { path: string; content: string }) => {
      return apiRequest("POST", `/api/workspaces/${workspaceId}/files`, { 
        path, 
        content: content || "",
        language: path.split(".").pop() || "plaintext"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/files`] });
    },
  });

  const updateFileMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      return apiRequest("PUT", `/api/files/${id}`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/files`] });
    },
  });

  const renameFileMutation = useMutation({
    mutationFn: async ({ id, newPath }: { id: string; newPath: string }) => {
      return apiRequest("PATCH", `/api/files/${id}/rename`, { newPath });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/files`] });
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/files`] });
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
    // Note: Don't manually clear presence here - CodeEditor's cleanup will call
    // onAwarenessUpdate(tabId, []) which triggers handleCombinedClearPresence
    
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

  const handleCreateFile = async () => {
    if (!newFilePath.trim()) {
      addLog("error", "File path cannot be empty");
      return;
    }
    
    // Check for duplicate paths
    const existingFile = files.find((f: any) => f.path === newFilePath);
    if (existingFile) {
      addLog("error", `File already exists at path: ${newFilePath}`);
      return;
    }
    
    try {
      await createFileMutation.mutateAsync({ 
        path: newFilePath, 
        content: "" 
      });
      setNewFileDialogOpen(false);
      setNewFilePath("");
      addLog("info", `Created file: ${newFilePath}`);
    } catch (error: any) {
      addLog("error", `Failed to create file: ${error.message || "Unknown error"}`);
    }
  };

  const handleRenameFile = async () => {
    if (!renamePath.trim()) {
      addLog("error", "File path cannot be empty");
      return;
    }
    
    if (!renameFile) return;
    
    try {
      await renameFileMutation.mutateAsync({ 
        id: renameFile.id, 
        newPath: renamePath 
      });
      
      // Update ALL open tabs with matching ID (not just active)
      setOpenTabs((prev) =>
        prev.map((tab) =>
          tab.id === renameFile.id
            ? { ...tab, name: renamePath.split("/").pop() }
            : tab
        )
      );
      
      setRenameDialogOpen(false);
      setRenameFile(null);
      setRenamePath("");
      addLog("info", `Renamed file to: ${renamePath}`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || "Unknown error";
      addLog("error", `Failed to rename file: ${errorMsg}`);
    }
  };

  const handleDeleteFile = async () => {
    if (!deleteFile) return;
    
    try {
      await deleteFileMutation.mutateAsync(deleteFile.id);
      
      // Remove ALL tabs with matching ID (not just active)
      setOpenTabs((prev) => prev.filter((tab) => tab.id !== deleteFile.id));
      
      // If deleted file was active, switch to another tab
      if (activeTabId === deleteFile.id) {
        const remaining = openTabs.filter((tab) => tab.id !== deleteFile.id);
        setActiveTabId(remaining.length > 0 ? remaining[0].id : null);
      }
      
      setDeleteDialogOpen(false);
      setDeleteFile(null);
      addLog("info", `Deleted file: ${deleteFile.path}`);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || "Unknown error";
      addLog("error", `Failed to delete file: ${errorMsg}`);
      // Keep dialog open on error so user can retry or cancel
    }
  };

  const handleTerminalCommand = (command: string) => {
    // Add command to terminal
    setTerminalLines((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        type: "command",
        content: command,
      },
    ]);
    
    // Send command via WebSocket for execution
    if (wsRef.current) {
      wsRef.current.send({
        type: "terminal_command",
        workspaceId: workspaceId,
        command,
      });
    }
  };

  const handleExportWorkspace = async () => {
    try {
      const exportUrl = `/api/workspaces/${workspaceId}/export`;
      
      // Show initial toast
      toast({
        title: "Exporting workspace",
        description: "Preparing your workspace for download...",
      });
      
      // Fetch the ZIP file with credentials
      const response = await fetch(exportUrl, {
        method: 'GET',
        credentials: 'include',
      });
      
      // Check for errors
      if (!response.ok) {
        let errorMessage = "Failed to export workspace";
        
        // Try to parse error message from server
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        
        toast({
          title: "Export failed",
          description: errorMessage,
          variant: "destructive",
        });
        return;
      }
      
      // Get the blob and trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `workspace-${workspaceId}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up the blob URL
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export successful",
        description: "Your workspace has been downloaded",
      });
    } catch (error: any) {
      toast({
        title: "Export failed",
        description: error.message || "An unexpected error occurred",
        variant: "destructive",
      });
    }
  };

  // Task 7.10: Follow mode controller
  const handleUserClick = (userId: string) => {
    // Can't follow yourself
    if (userId === user.id) {
      toast({
        title: "Cannot follow yourself",
        description: "Select another collaborator to follow their view",
      });
      return;
    }

    // Toggle follow mode
    const isCurrentlyFollowing = followingUserId === userId;
    setFollowingUserId(isCurrentlyFollowing ? null : userId);

    const followedUser = workspaceUsers.find(u => u.userId === userId);
    const userName = followedUser?.name || "User";

    toast({
      title: isCurrentlyFollowing ? "Stopped following" : `Following ${userName}`,
      description: isCurrentlyFollowing 
        ? "You are now viewing your own files" 
        : `You will automatically switch to files ${userName} is viewing`,
    });
  };

  // Task 7.10: Auto-switch files when followed user changes files
  useEffect(() => {
    if (!followingUserId) return;

    const followedUser = workspaceUsers.find(u => u.userId === followingUserId);
    
    // Exit follow mode if user disconnected
    if (!followedUser || !followedUser.connected) {
      setFollowingUserId(null);
      toast({
        title: "Stopped following",
        description: "The user you were following has disconnected",
      });
      return;
    }

    // Auto-open the file the followed user is viewing
    if (followedUser.activeFile && followedUser.activeFile !== activeTabId) {
      const file = files.find((f: any) => f.id === followedUser.activeFile);
      if (file) {
        handleFileSelect(file);
        addLog("info", `Following ${followedUser.name} - switched to ${followedUser.activeFileName || file.path}`);
      }
    }
  }, [followingUserId, workspaceUsers, files]);

  // Task 7.10: Exit follow mode on manual file switch
  const handleManualTabChange = (tabId: string | null) => {
    setActiveTabId(tabId);
    
    // Exit follow mode if user manually switched files
    if (followingUserId && tabId) {
      const followedUser = workspaceUsers.find(u => u.userId === followingUserId);
      if (followedUser && tabId !== followedUser.activeFile) {
        setFollowingUserId(null);
        toast({
          title: "Stopped following",
          description: "Follow mode exited (manual file switch)",
        });
      }
    }
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

  // Command system integration
  const { commands, shortcuts } = useIDECommands({
    onOpenSettings: () => setSettingsOpen(true),
    onOpenPackages: () => setPackagesOpen(true),
    onOpenTemplates: () => setTemplatesOpen(true),
    onOpenGitHub: () => setGithubBrowserOpen(true),
    onNewFile: () => setNewFileDialogOpen(true),
    onSwitchToCustomEditor: () => setEditorView("custom"),
    onSwitchToCodeServer: () => setEditorView("code-server"),
    onSwitchToPreview: () => setEditorView("preview"),
    onSwitchToSplit: () => setEditorView("split"),
    onFocusChat: () => setRightPanelTab("chat"),
    onFocusLogs: () => setRightPanelTab("logs"),
    onFocusAgent: () => setRightPanelTab("agent"),
    onFocusGit: () => setRightPanelTab("git"),
    onFocusExecution: () => setRightPanelTab("execution"),
    onFocusPackages: () => setRightPanelTab("packages"),
    onTogglePalette: () => setCommandPaletteOpen((prev) => !prev),
    hasActiveFile: activeTabId !== null,
    isGenerating,
    canExecute: activeTabId !== null,
  });

  // Enable keyboard shortcuts (disabled when modals are open to avoid conflicts)
  const shortcutsEnabled = !settingsOpen && !packagesOpen && !templatesOpen && 
                           !newFileDialogOpen && !renameDialogOpen && !deleteDialogOpen;
  useKeyboardShortcuts(shortcuts, shortcutsEnabled);

  // Task 7.10: ESC key handler to exit follow mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && followingUserId) {
        setFollowingUserId(null);
        toast({
          title: "Stopped following",
          description: "Follow mode exited (ESC pressed)",
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [followingUserId]);

  return (
    <div className="h-screen flex flex-col bg-background">
      <TopBar
        workspaceId={workspaceId}
        workspaceName="my-project"
        agentStatus={agentStatus}
        onRunAgent={() => console.log("Run agent")}
        onPauseAgent={() => console.log("Pause agent")}
        onResetAgent={() => console.log("Reset agent")}
        onTemplates={() => setTemplatesOpen(true)}
        onGitHub={() => setGithubBrowserOpen(true)}
        onPackages={() => setPackagesOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onExport={handleExportWorkspace}
        followingUserName={followingUserId ? workspaceUsers.find(u => u.userId === followingUserId)?.name : null}
        onStopFollowing={() => setFollowingUserId(null)}
      />

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={15} minSize={10} maxSize={25}>
          <FileExplorer
            files={fileTree}
            filePresence={filePresence}
            onFileSelect={handleFileSelect}
            onNewFile={() => setNewFileDialogOpen(true)}
            onRenameFile={(file) => {
              const fullFile = files.find((f: any) => f.id === file.id);
              if (fullFile) {
                setRenameFile(fullFile);
                setRenamePath(fullFile.path);
                setRenameDialogOpen(true);
              }
            }}
            onDeleteFile={(file) => {
              const fullFile = files.find((f: any) => f.id === file.id);
              if (fullFile) {
                setDeleteFile(fullFile);
                setDeleteDialogOpen(true);
              }
            }}
          />
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="flex flex-col h-full">
            {/* Editor view tabs */}
            <Tabs value={editorView} onValueChange={(v: any) => setEditorView(v)} className="flex flex-col flex-1 overflow-hidden">
              <TabsList className="w-full justify-start rounded-none border-b h-9 bg-muted/30">
                <TabsTrigger value="custom" className="text-xs" data-testid="tab-editor-custom">
                  Editor
                </TabsTrigger>
                <TabsTrigger value="split" className="text-xs" data-testid="tab-editor-split">
                  Split View
                </TabsTrigger>
                <TabsTrigger value="code-server" className="text-xs" data-testid="tab-editor-vscode">
                  VS Code
                </TabsTrigger>
                <TabsTrigger value="preview" className="text-xs" data-testid="tab-editor-preview">
                  Preview
                </TabsTrigger>
              </TabsList>

              {/* Custom Editor */}
              <TabsContent value="custom" className="flex flex-col flex-1 m-0 overflow-hidden">
                <div className="flex-1 overflow-hidden">
                  <CodeEditor
                    tabs={openTabs}
                    activeTabId={activeTabId || undefined}
                    onTabChange={handleManualTabChange}
                    onTabClose={handleTabClose}
                    onContentChange={handleContentChange}
                    onAwarenessUpdate={handleAwarenessUpdate}
                    userId={user.id}
                    username={user.username}
                  />
                </div>
              </TabsContent>

              {/* Split View - Code + Preview side-by-side */}
              <TabsContent value="split" className="flex-1 m-0 overflow-hidden">
                <ResizablePanelGroup direction="horizontal">
                  <ResizablePanel defaultSize={50} minSize={30}>
                    <CodeEditor
                      tabs={openTabs}
                      activeTabId={activeTabId || undefined}
                      onTabChange={handleManualTabChange}
                      onTabClose={handleTabClose}
                      onContentChange={handleContentChange}
                      onAwarenessUpdate={handleAwarenessUpdate}
                    />
                  </ResizablePanel>
                  <ResizableHandle />
                  <ResizablePanel defaultSize={50} minSize={30}>
                    <PreviewPane workspaceId={workspaceId} autoReload={true} />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </TabsContent>

              {/* code-server (VS Code) */}
              <TabsContent value="code-server" className="flex-1 m-0 overflow-hidden">
                <CodeServerFrame workspaceId={workspaceId} />
              </TabsContent>

              {/* Live Preview */}
              <TabsContent value="preview" className="flex-1 m-0 overflow-hidden">
                <PreviewPane workspaceId={workspaceId} autoReload={true} />
              </TabsContent>
            </Tabs>

            {/* Terminal (shown for all views except preview and split) */}
            {editorView !== "preview" && editorView !== "split" && (
              <TerminalPanel
                lines={terminalLines}
                onCommand={handleTerminalCommand}
                onClear={() => setTerminalLines([])}
              />
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={25} minSize={20} maxSize={35}>
          <Tabs value={rightPanelTab} onValueChange={setRightPanelTab} className="flex flex-col h-full">
            <TabsList className="w-full justify-start rounded-none border-b h-10 bg-muted/30">
              <TabsTrigger value="chat" className="text-xs" data-testid="tab-chat">
                Chat
              </TabsTrigger>
              <TabsTrigger value="files" className="text-xs" data-testid="tab-files">
                Files
              </TabsTrigger>
              <TabsTrigger value="execution" className="text-xs" data-testid="tab-execution">
                Execution
              </TabsTrigger>
              <TabsTrigger value="git" className="text-xs" data-testid="tab-git">
                Git
              </TabsTrigger>
              <TabsTrigger value="state" className="text-xs" data-testid="tab-state">
                State
              </TabsTrigger>
              <TabsTrigger value="logs" className="text-xs" data-testid="tab-logs">
                Logs
              </TabsTrigger>
              <TabsTrigger value="packages" className="text-xs" data-testid="tab-packages">
                Packages
              </TabsTrigger>
              <TabsTrigger value="users" className="text-xs" data-testid="tab-users">
                Users
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="flex-1 m-0 overflow-hidden">
              <ChatPanel
                messages={chatMessages.map((msg) => ({
                  ...msg,
                  timestamp: new Date(msg.createdAt || msg.timestamp),
                }))}
                onSendMessage={sendChatMessage}
                onGenerateWithAI={handleGenerateWithAI}
                isStreaming={isStreaming}
                streamingMessage={streamingMessage}
                agentWorkflow={agentWorkflow}
                onFileClick={handleFileClickFromWorkflow}
              />
            </TabsContent>
            <TabsContent value="files" className="flex-1 m-0 overflow-hidden">
              <FilesChangedPanel filesGenerated={agentWorkflow?.files_generated || []} />
            </TabsContent>
            <TabsContent value="execution" className="flex-1 m-0 overflow-hidden">
              <CodeExecutionPanel
                workspaceId={workspaceId}
                selectedFileId={activeTabId}
              />
            </TabsContent>
            <TabsContent value="git" className="flex-1 m-0 overflow-hidden">
              <GitPanel workspaceId={workspaceId} />
            </TabsContent>
            <TabsContent value="state" className="flex-1 m-0 overflow-hidden">
              <AgentStatePanel agentStatus={agentStatus} />
            </TabsContent>
            <TabsContent value="logs" className="flex-1 m-0 overflow-hidden">
              <LogsPanel logs={logs} onClear={() => setLogs([])} />
            </TabsContent>
            <TabsContent value="packages" className="flex-1 m-0 overflow-hidden">
              <PackageInstallation installations={packageInstallations} />
            </TabsContent>
            <TabsContent value="users" className="flex-1 m-0 overflow-hidden">
              <UserListPanel 
                users={workspaceUsers}
                currentUserId={user.id}
                onUserClick={handleUserClick}
                followingUserId={followingUserId}
              />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} workspaceId={workspaceId} />
      <TemplateSelectorModal 
        open={templatesOpen} 
        onClose={() => setTemplatesOpen(false)}
        workspaceId={workspaceId}
      />

      <PackageManagerModal 
        open={packagesOpen} 
        onClose={() => setPackagesOpen(false)}
        workspaceId={workspaceId}
      />

      <GitHubBrowserModal
        open={githubBrowserOpen}
        onOpenChange={setGithubBrowserOpen}
        workspaceId={workspaceId}
      />

      {/* New File Dialog */}
      <Dialog open={newFileDialogOpen} onOpenChange={setNewFileDialogOpen}>
        <DialogContent data-testid="dialog-new-file">
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="file-path">File Path</Label>
              <Input
                id="file-path"
                data-testid="input-file-path"
                placeholder="src/components/MyComponent.tsx"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateFile();
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">
                Folders will be created automatically based on the path
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewFileDialogOpen(false)}
              data-testid="button-cancel-file"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFile}
              disabled={!newFilePath.trim() || createFileMutation.isPending}
              data-testid="button-create-file"
            >
              {createFileMutation.isPending ? "Creating..." : "Create File"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename File Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent data-testid="dialog-rename-file">
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-path">New Path</Label>
              <Input
                id="rename-path"
                data-testid="input-rename-path"
                placeholder="src/components/MyComponent.tsx"
                value={renamePath}
                onChange={(e) => setRenamePath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRenameFile();
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">
                Current: {renameFile?.path}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRenameDialogOpen(false)}
              data-testid="button-cancel-rename"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRenameFile}
              disabled={!renamePath.trim() || renameFileMutation.isPending}
              data-testid="button-confirm-rename"
            >
              {renameFileMutation.isPending ? "Renaming..." : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete File Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent data-testid="dialog-delete-file">
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm">
              Are you sure you want to delete <strong>{deleteFile?.path}</strong>?
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              This action cannot be undone.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteFile}
              disabled={deleteFileMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteFileMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        commands={commands}
      />
    </div>
  );
}

/**
 * IDE with authentication and workspace-level awareness
 * Task 7.9: Integrates AuthProvider → WorkspaceAwarenessProvider → IDEContent
 */
export default function IDE() {
  return (
    <AuthProvider>
      <IDEWithAuth />
    </AuthProvider>
  );
}

/**
 * IDE component with auth-gated workspace awareness
 * CRITICAL: Loading guard MUST return before WorkspaceAwarenessProvider is instantiated
 */
function IDEWithAuth() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/ide/:workspaceId");

  // Extract workspaceId from route
  const workspaceId = params?.workspaceId;

  // Redirect to dashboard if no workspaceId
  if (!match || !workspaceId) {
    navigate("/dashboard");
    return null;
  }

  // Block rendering until user is available (either from auth or fallback)
  // This prevents WorkspaceAwarenessProvider from being instantiated with empty props
  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading user identity...</p>
        </div>
      </div>
    );
  }

  // Render IDE with authenticated user (real or fallback)
  // User is guaranteed non-null here, so WorkspaceAwarenessProvider gets valid props
  
  // Real-time collaborative editing enabled (Week 1 Priority #1)
  // Yjs WebSocket on /yjs/* paths, main WebSocket on /ws
  const ENABLE_YJS_COLLABORATION = true;
  
  if (ENABLE_YJS_COLLABORATION) {
    return (
      <WorkspaceAwarenessProvider
        workspaceId={workspaceId}
        userId={user.id}
        username={user.username}
      >
        <IDEContent workspaceId={workspaceId} />
      </WorkspaceAwarenessProvider>
    );
  }
  
  // Run without collaborative features
  return <IDEContent workspaceId={workspaceId} />;
}
