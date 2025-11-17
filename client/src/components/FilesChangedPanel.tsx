import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ChevronDown, ChevronRight, Eye, EyeOff, GitCompare } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import DiffViewer from "./DiffViewer";
import type { FileVersionHistory } from "@shared/schema";

interface FileChange {
  path: string;
  content: string;
  language?: string;
  type?: "created" | "modified" | "deleted";
}

interface FilesChangedPanelProps {
  filesGenerated: FileChange[];
  workspaceId?: string;
}

export default function FilesChangedPanel({ filesGenerated, workspaceId }: FilesChangedPanelProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [showingDiff, setShowingDiff] = useState<Set<string>>(new Set());
  const [diffViewerFile, setDiffViewerFile] = useState<FileChange | null>(null);
  const { toast } = useToast();

  const toggleFileExpanded = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const toggleDiffView = (path: string) => {
    setShowingDiff(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const openDiffViewer = (file: FileChange) => {
    setDiffViewerFile(file);
  };

  const closeDiffViewer = () => {
    setDiffViewerFile(null);
  };

  // Fetch file history for the selected file
  const { data: fileHistory, isLoading: isLoadingHistory, error: historyError } = useQuery<FileVersionHistory[]>({
    queryKey: [`/api/workspaces/${workspaceId}/file-history`, diffViewerFile?.path],
    enabled: !!diffViewerFile && !!workspaceId,
    retry: false,
    queryFn: async () => {
      if (!diffViewerFile || !workspaceId) return [];
      const response = await fetch(
        `/api/workspaces/${workspaceId}/file-history?path=${encodeURIComponent(diffViewerFile.path)}&limit=1`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(errorText || 'Failed to fetch file history');
      }
      return response.json();
    },
    onError: (error: any) => {
      console.error("[FileHistory] Failed to fetch history:", error);
      toast({
        title: "Failed to load file history",
        description: "Could not retrieve previous versions for diff comparison. The file may not have any history yet.",
        variant: "destructive",
      });
    },
  });

  const getFileExtension = (path: string): string => {
    const parts = path.split('.');
    return parts.length > 1 ? parts[parts.length - 1] : '';
  };

  const getFileTypeColor = (ext: string): string => {
    const colorMap: Record<string, string> = {
      'ts': 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
      'tsx': 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
      'js': 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
      'jsx': 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20',
      'css': 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20',
      'html': 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20',
      'json': 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20',
      'md': 'bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20',
    };
    return colorMap[ext] || 'bg-muted text-muted-foreground border-border';
  };

  const renderFileContent = (file: FileChange) => {
    const lines = file.content.split('\n');
    return (
      <div className="mt-2 rounded-md bg-muted/30 border">
        <div className="p-2 border-b bg-muted/50 flex items-center justify-between">
          <span className="text-xs font-mono text-muted-foreground">
            {lines.length} lines
          </span>
          <div className="flex items-center gap-1">
            {workspaceId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1"
                onClick={() => openDiffViewer(file)}
                data-testid={`button-view-diff-${file.path}`}
              >
                <GitCompare className="w-3 h-3" />
                View Diff
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs gap-1"
              onClick={() => toggleDiffView(file.path)}
              data-testid={`button-toggle-preview-${file.path}`}
            >
              {showingDiff.has(file.path) ? (
                <>
                  <EyeOff className="w-3 h-3" />
                  Hide Preview
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3" />
                  Show Preview
                </>
              )}
            </Button>
          </div>
        </div>
        {showingDiff.has(file.path) && (
          <ScrollArea className="max-h-96">
            <pre className="p-3 text-xs font-mono overflow-x-auto">
              <code>{file.content}</code>
            </pre>
          </ScrollArea>
        )}
      </div>
    );
  };

  if (!filesGenerated || filesGenerated.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center p-6 text-center">
        <FileText className="w-12 h-12 text-muted-foreground mb-3" />
        <h3 className="text-sm font-medium mb-1">No files changed</h3>
        <p className="text-xs text-muted-foreground">
          Files created or modified by the AI will appear here
        </p>
      </div>
    );
  }

  const latestSnapshot = fileHistory && fileHistory.length > 0 ? fileHistory[0] : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">Files Changed</span>
          </div>
          <Badge variant="secondary" className="text-xs" data-testid="badge-files-count">
            {filesGenerated.length} {filesGenerated.length === 1 ? 'file' : 'files'}
          </Badge>
        </div>
      </div>

      {/* Files List */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-2">
          {filesGenerated.map((file, index) => {
            const isExpanded = expandedFiles.has(file.path);
            const ext = getFileExtension(file.path);

            return (
              <Card key={`${file.path}-${index}`} className="overflow-hidden">
                <Collapsible open={isExpanded} onOpenChange={() => toggleFileExpanded(file.path)}>
                  <CollapsibleTrigger className="w-full" data-testid={`file-item-${file.path}`}>
                    <div className="flex items-center gap-2 p-3 hover-elevate active-elevate-2">
                      <div className="flex-shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                      <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-xs font-mono truncate flex-1 text-left">
                        {file.path}
                      </span>
                      {ext && (
                        <Badge
                          variant="outline"
                          className={`text-xs uppercase ${getFileTypeColor(ext)}`}
                        >
                          {ext}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                      >
                        Created
                      </Badge>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-3 pb-3">
                      {renderFileContent(file)}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      </ScrollArea>

      {/* Diff Viewer Dialog */}
      {diffViewerFile && (
        <DiffViewer
          open={!!diffViewerFile}
          onClose={closeDiffViewer}
          filePath={diffViewerFile.path}
          oldContent={latestSnapshot?.content || ""}
          newContent={diffViewerFile.content}
          oldVersion={latestSnapshot ? {
            version: latestSnapshot.version,
            capturedAt: latestSnapshot.capturedAt.toString(),
            changeType: latestSnapshot.changeType,
          } : undefined}
        />
      )}
    </div>
  );
}
