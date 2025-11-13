import { useState } from "react";
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FolderOpen, 
  File, 
  FileCode, 
  FileJson,
  Plus,
  MoreVertical,
  Pencil,
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  language?: string;
  children?: FileNode[];
}

interface CollaboratorPresence {
  userId: string;
  name: string;
  color: string;
}

type FilePresenceMap = Record<string, CollaboratorPresence[]>;

interface FileExplorerProps {
  files?: FileNode[];
  filePresence?: FilePresenceMap; // Task 7.8: Show presence indicators
  onFileSelect?: (file: FileNode) => void;
  onNewFile?: () => void;
  onRenameFile?: (file: FileNode) => void;
  onDeleteFile?: (file: FileNode) => void;
}

export default function FileExplorer({
  files = [],
  filePresence = {},
  onFileSelect,
  onNewFile,
  onRenameFile,
  onDeleteFile,
}: FileExplorerProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const toggleFolder = (id: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedFolders(newExpanded);
  };

  const handleFileClick = (file: FileNode) => {
    if (file.type === "file") {
      // Clear selection before setting new one to handle renamed files
      setSelectedFile(null);
      setTimeout(() => setSelectedFile(file.id), 0);
      onFileSelect?.(file);
    } else {
      toggleFolder(file.id);
    }
  };

  const getFileIcon = (file: FileNode) => {
    if (file.type === "folder") {
      return expandedFolders.has(file.id) ? (
        <FolderOpen className="w-4 h-4 text-blue-500" />
      ) : (
        <Folder className="w-4 h-4 text-blue-500" />
      );
    }
    
    if (file.name.endsWith(".json")) {
      return <FileJson className="w-4 h-4 text-yellow-500" />;
    }
    if (file.name.match(/\.(ts|tsx|js|jsx)$/)) {
      return <FileCode className="w-4 h-4 text-blue-400" />;
    }
    return <File className="w-4 h-4 text-muted-foreground" />;
  };

  const renderFileTree = (nodes: FileNode[], level = 0) => {
    return nodes.map((node) => (
      <div key={node.id}>
        <div
          className={`
            group flex items-center gap-1 h-8 px-2 rounded-md
            hover-elevate
            ${selectedFile === node.id ? "bg-accent" : ""}
          `}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          data-testid={`file-item-${node.id}`}
        >
          <div
            className="flex items-center gap-1 flex-1 min-w-0 cursor-pointer"
            onClick={() => handleFileClick(node)}
          >
            {node.type === "folder" && (
              <div className="w-4 flex items-center justify-center">
                {expandedFolders.has(node.id) ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </div>
            )}
            {node.type === "file" && <div className="w-4" />}
            {getFileIcon(node)}
            <span className="text-sm flex-1 truncate">{node.name}</span>
            
            {/* Presence indicators - show colored dots for users viewing this file (Task 7.8 - fixed to use unique file ID) */}
            {node.type === "file" && filePresence[node.id] && filePresence[node.id].length > 0 && (
              <div className="flex items-center gap-0.5 ml-1" data-testid={`presence-indicators-${node.id}`}>
                {filePresence[node.id].slice(0, 3).map((user) => (
                  <div
                    key={user.userId}
                    className="w-2 h-2 rounded-full border border-background"
                    style={{ backgroundColor: user.color }}
                    title={user.name}
                    data-testid={`presence-dot-${user.userId}`}
                  />
                ))}
                {filePresence[node.id].length > 3 && (
                  <span className="text-xs text-muted-foreground ml-0.5">
                    +{filePresence[node.id].length - 3}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action menu - only show for files */}
          {node.type === "file" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-6 h-6 opacity-0 group-hover:opacity-100"
                  data-testid={`button-file-menu-${node.id}`}
                >
                  <MoreVertical className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onRenameFile?.(node);
                  }}
                  data-testid={`menu-rename-${node.id}`}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteFile?.(node);
                  }}
                  className="text-destructive"
                  data-testid={`menu-delete-${node.id}`}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {node.type === "folder" &&
          expandedFolders.has(node.id) &&
          node.children &&
          renderFileTree(node.children, level + 1)}
      </div>
    ));
  };

  return (
    <div className="w-64 border-r bg-background flex flex-col h-full">
      <div className="h-10 border-b flex items-center justify-between px-3">
        <span className="text-sm font-medium">Files</span>
        <div className="flex gap-1">
          <Button 
            size="icon" 
            variant="ghost" 
            className="w-7 h-7"
            onClick={onNewFile}
            data-testid="button-new-file"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {renderFileTree(files)}
        </div>
      </ScrollArea>
    </div>
  );
}
