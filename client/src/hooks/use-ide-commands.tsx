import { useMemo } from "react";
import { CommandItem } from "@/components/CommandPalette";
import { KeyboardShortcut } from "./use-keyboard-shortcuts";
import {
  Settings, Package, Folder, FileCode, Play,
  LayoutGrid, Terminal, MessageSquare, GitBranch,
  Code, Eye, Layers, Save, Search
} from "lucide-react";

export interface IDECommandContext {
  onOpenSettings: () => void;
  onOpenPackages: () => void;
  onOpenTemplates: () => void;
  onOpenGitHub: () => void;
  onNewFile: () => void;
  onSwitchToCustomEditor: () => void;
  onSwitchToCodeServer: () => void;
  onSwitchToPreview: () => void;
  onSwitchToSplit: () => void;
  onFocusChat: () => void;
  onFocusLogs: () => void;
  onFocusAgent: () => void;
  onFocusGit: () => void;
  onFocusExecution: () => void;
  onFocusPackages: () => void;
  onTogglePalette: () => void;
  hasActiveFile: boolean;
  isGenerating: boolean;
  canExecute: boolean;
}

export function useIDECommands(context: IDECommandContext) {
  const commands = useMemo<CommandItem[]>(() => {
    return [
      {
        id: "command-palette",
        label: "Command Palette",
        description: "Open command palette",
        category: "General",
        shortcut: "Ctrl+K",
        icon: <Search className="w-4 h-4" />,
        onSelect: context.onTogglePalette,
      },
      {
        id: "settings",
        label: "Settings",
        description: "Open workspace settings",
        category: "General",
        shortcut: "Ctrl+,",
        icon: <Settings className="w-4 h-4" />,
        onSelect: context.onOpenSettings,
      },
      {
        id: "packages",
        label: "Manage Packages",
        description: "Install npm, pip, or apt packages",
        category: "General",
        shortcut: "Ctrl+Shift+P",
        icon: <Package className="w-4 h-4" />,
        onSelect: context.onOpenPackages,
      },
      {
        id: "templates",
        label: "Templates",
        description: "Start from a project template",
        category: "General",
        icon: <LayoutGrid className="w-4 h-4" />,
        onSelect: context.onOpenTemplates,
      },
      {
        id: "github",
        label: "Browse GitHub Repos",
        description: "Import from GitHub repositories",
        category: "General",
        icon: <GitBranch className="w-4 h-4" />,
        onSelect: context.onOpenGitHub,
      },
      {
        id: "new-file",
        label: "New File",
        description: "Create a new file",
        category: "Files",
        shortcut: "Ctrl+N",
        icon: <FileCode className="w-4 h-4" />,
        onSelect: context.onNewFile,
      },
      {
        id: "view-custom",
        label: "Switch to Custom Editor",
        description: "Use built-in code editor",
        category: "View",
        shortcut: "Ctrl+1",
        icon: <Code className="w-4 h-4" />,
        onSelect: context.onSwitchToCustomEditor,
      },
      {
        id: "view-code-server",
        label: "Switch to VS Code",
        description: "Use full VS Code editor",
        category: "View",
        shortcut: "Ctrl+2",
        icon: <Code className="w-4 h-4" />,
        onSelect: context.onSwitchToCodeServer,
      },
      {
        id: "view-preview",
        label: "Switch to Preview",
        description: "View live app preview",
        category: "View",
        shortcut: "Ctrl+3",
        icon: <Eye className="w-4 h-4" />,
        onSelect: context.onSwitchToPreview,
      },
      {
        id: "view-split",
        label: "Split View",
        description: "Show editor and preview side-by-side",
        category: "View",
        shortcut: "Ctrl+4",
        icon: <Layers className="w-4 h-4" />,
        onSelect: context.onSwitchToSplit,
      },
      {
        id: "panel-chat",
        label: "Focus Chat",
        description: "Open chat panel",
        category: "Panels",
        icon: <MessageSquare className="w-4 h-4" />,
        onSelect: context.onFocusChat,
      },
      {
        id: "panel-logs",
        label: "Focus Logs",
        description: "Open logs panel",
        category: "Panels",
        icon: <Terminal className="w-4 h-4" />,
        onSelect: context.onFocusLogs,
      },
      {
        id: "panel-agent",
        label: "Focus Agent State",
        description: "View AI agent status",
        category: "Panels",
        icon: <Play className="w-4 h-4" />,
        onSelect: context.onFocusAgent,
      },
      {
        id: "panel-git",
        label: "Focus Git",
        description: "Open Git panel",
        category: "Panels",
        icon: <GitBranch className="w-4 h-4" />,
        onSelect: context.onFocusGit,
      },
      {
        id: "panel-execution",
        label: "Focus Code Execution",
        description: "Run code and view output",
        category: "Panels",
        icon: <Play className="w-4 h-4" />,
        onSelect: context.onFocusExecution,
      },
      {
        id: "panel-packages",
        label: "Focus Package Installation",
        description: "View package installation progress",
        category: "Panels",
        icon: <Package className="w-4 h-4" />,
        onSelect: context.onFocusPackages,
      },
    ];
  }, [context]);

  const shortcuts = useMemo<KeyboardShortcut[]>(() => {
    return [
      {
        id: "command-palette",
        key: "k",
        ctrl: true,
        description: "Open command palette",
        category: "General",
        handler: context.onTogglePalette,
      },
      {
        id: "settings",
        key: ",",
        ctrl: true,
        description: "Open settings",
        category: "General",
        handler: context.onOpenSettings,
      },
      {
        id: "packages",
        key: "p",
        ctrl: true,
        shift: true,
        description: "Manage packages",
        category: "General",
        handler: context.onOpenPackages,
      },
      {
        id: "new-file",
        key: "n",
        ctrl: true,
        description: "Create new file",
        category: "Files",
        handler: context.onNewFile,
      },
      {
        id: "view-1",
        key: "1",
        ctrl: true,
        description: "Switch to custom editor",
        category: "View",
        handler: context.onSwitchToCustomEditor,
      },
      {
        id: "view-2",
        key: "2",
        ctrl: true,
        description: "Switch to VS Code",
        category: "View",
        handler: context.onSwitchToCodeServer,
      },
      {
        id: "view-3",
        key: "3",
        ctrl: true,
        description: "Switch to preview",
        category: "View",
        handler: context.onSwitchToPreview,
      },
      {
        id: "view-4",
        key: "4",
        ctrl: true,
        description: "Split view",
        category: "View",
        handler: context.onSwitchToSplit,
      },
    ];
  }, [context]);

  return { commands, shortcuts };
}
