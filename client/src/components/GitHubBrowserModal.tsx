import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Github,
  GitBranch,
  Star,
  Eye,
  GitFork,
  Lock,
  Globe,
  Download,
  Search,
  AlertCircle,
} from "lucide-react";

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  private: boolean;
  fork: boolean;
  stargazers_count: number;
  watchers_count: number;
  forks_count: number;
  language: string | null;
  default_branch: string;
  updated_at: string;
}

interface GitHubBrowserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

export function GitHubBrowserModal({ open, onOpenChange, workspaceId }: GitHubBrowserModalProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);

  // Fetch user repositories
  const { data: repos, isLoading, error } = useQuery<GitHubRepo[]>({
    queryKey: ["/api/github/repos"],
    enabled: open,
    retry: false,
  });

  // Clone repository mutation
  const cloneMutation = useMutation({
    mutationFn: async ({ repoUrl, branch }: { repoUrl: string; branch?: string }) => {
      const response = await fetch(`/api/workspaces/${workspaceId}/git/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl, branch }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Clone failed");
      }
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces", workspaceId, "git", "status"] });
      toast({
        title: "Repository cloned",
        description: "Successfully cloned repository to workspace",
      });
      onOpenChange(false);
      setSelectedRepo(null);
    },
    onError: (error: any) => {
      toast({
        title: "Clone failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClone = (repo: GitHubRepo) => {
    cloneMutation.mutate({ repoUrl: repo.clone_url, branch: repo.default_branch });
  };

  const filteredRepos = repos?.filter((repo) => {
    const query = searchQuery.toLowerCase();
    return (
      repo.name.toLowerCase().includes(query) ||
      repo.description?.toLowerCase().includes(query) ||
      false
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="w-5 h-5" />
            Clone from GitHub
          </DialogTitle>
          <DialogDescription>
            Select a repository from your GitHub account to clone
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-3">
              <AlertCircle className="w-12 h-12 mx-auto text-destructive" />
              <div className="space-y-1">
                <p className="font-medium">GitHub connection failed</p>
                <p className="text-sm text-muted-foreground">
                  Please ensure GitHub integration is properly configured
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search repositories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-repos"
              />
            </div>

            {/* Repository list */}
            <ScrollArea className="flex-1 -mx-6 px-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center space-y-2">
                    <Github className="w-8 h-8 mx-auto animate-pulse text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading repositories...</p>
                  </div>
                </div>
              ) : filteredRepos && filteredRepos.length > 0 ? (
                <div className="space-y-2">
                  {filteredRepos.map((repo) => (
                    <div
                      key={repo.id}
                      className="p-4 rounded-lg border bg-card hover-elevate"
                      data-testid={`repo-${repo.name}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Repo name and visibility */}
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium truncate">{repo.name}</h3>
                            <Badge variant="outline" className="shrink-0">
                              {repo.private ? (
                                <>
                                  <Lock className="w-3 h-3 mr-1" />
                                  Private
                                </>
                              ) : (
                                <>
                                  <Globe className="w-3 h-3 mr-1" />
                                  Public
                                </>
                              )}
                            </Badge>
                            {repo.fork && (
                              <Badge variant="secondary" className="shrink-0">
                                <GitFork className="w-3 h-3 mr-1" />
                                Fork
                              </Badge>
                            )}
                          </div>

                          {/* Description */}
                          {repo.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {repo.description}
                            </p>
                          )}

                          {/* Metadata */}
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {repo.language && (
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-primary" />
                                {repo.language}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Star className="w-3 h-3" />
                              {repo.stargazers_count}
                            </span>
                            <span className="flex items-center gap-1">
                              <GitFork className="w-3 h-3" />
                              {repo.forks_count}
                            </span>
                            <span className="flex items-center gap-1">
                              <GitBranch className="w-3 h-3" />
                              {repo.default_branch}
                            </span>
                          </div>
                        </div>

                        {/* Clone button */}
                        <Button
                          size="sm"
                          onClick={() => handleClone(repo)}
                          disabled={cloneMutation.isPending}
                          data-testid={`button-clone-${repo.name}`}
                        >
                          <Download className="w-3 h-3 mr-1" />
                          Clone
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center space-y-2">
                    <Search className="w-8 h-8 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? "No repositories match your search" : "No repositories found"}
                    </p>
                  </div>
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
