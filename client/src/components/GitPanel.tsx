import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  Upload,
  Download,
  RefreshCw,
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: string[];
  modified: string[];
  untracked: string[];
  clean: boolean;
}

interface GitCommitInfo {
  hash: string;
  author: string;
  date: string;
  message: string;
}

interface GitPanelProps {
  workspaceId: string;
}

export function GitPanel({ workspaceId }: GitPanelProps) {
  const { toast } = useToast();
  const [commitMessage, setCommitMessage] = useState("");
  const [isCommitExpanded, setIsCommitExpanded] = useState(false);

  // Fetch Git status with automatic polling (every 5 seconds)
  const { data: gitStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<GitStatus>({
    queryKey: ["/api/workspaces", workspaceId, "git", "status"],
    refetchInterval: 5000, // Auto-refresh every 5 seconds via polling
    retry: false,
  });

  // Fetch commit history
  const { data: commitHistory } = useQuery<GitCommitInfo[]>({
    queryKey: ["/api/workspaces", workspaceId, "git", "history"],
    enabled: !!gitStatus,
    retry: false,
  });

  // Stage all files mutation
  const stageMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/git/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: [] }), // Empty array means stage all
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Stage failed");
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "git", "status"] });
      toast({
        title: "Files staged",
        description: "All changes have been staged for commit",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Stage failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async (message: string) => {
      const response = await fetch(`/api/workspaces/${workspaceId}/git/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Commit failed");
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "git", "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "git", "history"] });
      setCommitMessage("");
      setIsCommitExpanded(false);
      toast({
        title: "Committed",
        description: "Changes have been committed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Commit failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Push mutation
  const pushMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/git/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remote: "origin" }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Push failed");
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "git", "status"] });
      toast({
        title: "Pushed",
        description: "Changes pushed to remote successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Push failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Pull mutation
  const pullMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/workspaces/${workspaceId}/git/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remote: "origin" }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Pull failed");
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "git", "status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "files"] });
      toast({
        title: "Pulled",
        description: "Changes pulled from remote successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Pull failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStage = () => {
    stageMutation.mutate();
  };

  const handleCommit = () => {
    if (!commitMessage.trim()) {
      toast({
        title: "Commit message required",
        description: "Please enter a commit message",
        variant: "destructive",
      });
      return;
    }
    commitMutation.mutate(commitMessage);
  };

  const handlePush = () => {
    pushMutation.mutate();
  };

  const handlePull = () => {
    pullMutation.mutate();
  };

  const isPending = stageMutation.isPending || commitMutation.isPending || pushMutation.isPending || pullMutation.isPending;

  if (statusLoading) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading Git status...</p>
        </div>
      </div>
    );
  }

  if (!gitStatus) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <Card className="p-6 text-center space-y-3">
          <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground" />
          <div className="space-y-1">
            <h3 className="font-medium">Not a Git repository</h3>
            <p className="text-sm text-muted-foreground">
              Clone a repository or initialize Git to get started
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const totalChanges = gitStatus.staged.length + gitStatus.modified.length + gitStatus.untracked.length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            <span className="font-medium">{gitStatus.branch}</span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => refetchStatus()}
            data-testid="button-refresh-git"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Sync status */}
        <div className="flex gap-2">
          {gitStatus.ahead > 0 && (
            <Badge variant="secondary" data-testid="badge-ahead">
              <Upload className="w-3 h-3 mr-1" />
              {gitStatus.ahead} ahead
            </Badge>
          )}
          {gitStatus.behind > 0 && (
            <Badge variant="secondary" data-testid="badge-behind">
              <Download className="w-3 h-3 mr-1" />
              {gitStatus.behind} behind
            </Badge>
          )}
          {gitStatus.clean && (
            <Badge variant="outline" data-testid="badge-clean">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Clean
            </Badge>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePull}
            disabled={isPending}
            data-testid="button-pull"
          >
            <Download className="w-3 h-3 mr-1" />
            Pull
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handlePush}
            disabled={isPending || gitStatus.ahead === 0}
            data-testid="button-push"
          >
            <Upload className="w-3 h-3 mr-1" />
            Push
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Changes section */}
          {totalChanges > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">
                  Changes ({totalChanges})
                </h3>
                {totalChanges > 0 && gitStatus.staged.length === 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleStage}
                    disabled={isPending}
                    data-testid="button-stage-all"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Stage All
                  </Button>
                )}
              </div>

              {/* Staged files */}
              {gitStatus.staged.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Staged ({gitStatus.staged.length})</p>
                  {gitStatus.staged.map((file) => (
                    <div
                      key={file}
                      className="text-sm px-2 py-1 rounded bg-muted/50 flex items-center gap-2"
                      data-testid={`file-staged-${file}`}
                    >
                      <FileText className="w-3 h-3 text-green-600" />
                      {file}
                    </div>
                  ))}
                </div>
              )}

              {/* Modified files */}
              {gitStatus.modified.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Modified ({gitStatus.modified.length})</p>
                  {gitStatus.modified.map((file) => (
                    <div
                      key={file}
                      className="text-sm px-2 py-1 rounded bg-muted/50 flex items-center gap-2"
                      data-testid={`file-modified-${file}`}
                    >
                      <FileText className="w-3 h-3 text-orange-600" />
                      {file}
                    </div>
                  ))}
                </div>
              )}

              {/* Untracked files */}
              {gitStatus.untracked.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Untracked ({gitStatus.untracked.length})</p>
                  {gitStatus.untracked.map((file) => (
                    <div
                      key={file}
                      className="text-sm px-2 py-1 rounded bg-muted/50 flex items-center gap-2"
                      data-testid={`file-untracked-${file}`}
                    >
                      <FileText className="w-3 h-3 text-muted-foreground" />
                      {file}
                    </div>
                  ))}
                </div>
              )}

              {/* Commit section */}
              {gitStatus.staged.length > 0 && (
                <div className="space-y-2 pt-2">
                  <Textarea
                    placeholder="Commit message..."
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    className="resize-none"
                    rows={3}
                    data-testid="input-commit-message"
                  />
                  <Button
                    size="sm"
                    onClick={handleCommit}
                    disabled={isPending || !commitMessage.trim()}
                    data-testid="button-commit"
                  >
                    <GitCommit className="w-3 h-3 mr-1" />
                    Commit
                  </Button>
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Commit history */}
          {commitHistory && commitHistory.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Recent Commits</h3>
              {commitHistory.map((commit) => (
                <div
                  key={commit.hash}
                  className="space-y-1 p-2 rounded bg-muted/30"
                  data-testid={`commit-${commit.hash.substring(0, 7)}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium line-clamp-2">{commit.message}</p>
                    <Badge variant="outline" className="text-xs font-mono shrink-0">
                      {commit.hash.substring(0, 7)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{commit.author}</span>
                    <span>•</span>
                    <Clock className="w-3 h-3" />
                    <span>{new Date(commit.date).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
