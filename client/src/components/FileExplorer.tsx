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
  MoreVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  language?: string;
  children?: FileNode[];
}

interface FileExplorerProps {
  files?: FileNode[];
  onFileSelect?: (file: FileNode) => void;
  onNewFile?: () => void;
  onNewFolder?: () => void;
}

export default function FileExplorer({
  files = [],
  onFileSelect,
  onNewFile,
  onNewFolder,
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
      setSelectedFile(file.id);
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
            flex items-center gap-1 h-8 px-2 rounded-md cursor-pointer
            hover-elevate
            ${selectedFile === node.id ? "bg-accent" : ""}
          `}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => handleFileClick(node)}
          data-testid={`file-item-${node.id}`}
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
          <Button 
            size="icon" 
            variant="ghost" 
            className="w-7 h-7"
            data-testid="button-file-menu"
          >
            <MoreVertical className="w-4 h-4" />
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
