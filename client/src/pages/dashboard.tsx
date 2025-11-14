import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, FolderOpen, Code2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Workspace {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
}

export default function Dashboard() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);

  // Fetch workspaces (with aggressive refetching to detect deletions)
  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data stale after 30 seconds
  });

  // Create workspace mutation
  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest("POST", "/api/workspaces", { name });
      return response.json();
    },
    onSuccess: (newWorkspace: Workspace) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setCreateDialogOpen(false);
      setNewWorkspaceName("");
      toast({
        title: "Workspace created",
        description: `"${newWorkspace.name}" is ready to use.`,
      });
      // Navigate to the new workspace
      navigate(`/ide/${newWorkspace.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create workspace",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete workspace mutation
  const deleteMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      return apiRequest("DELETE", `/api/workspaces/${workspaceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setDeleteDialogOpen(false);
      setWorkspaceToDelete(null);
      toast({
        title: "Workspace deleted",
        description: "The workspace has been permanently removed.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete workspace",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateWorkspace = () => {
    const trimmedName = newWorkspaceName.trim();
    if (!trimmedName) {
      toast({
        title: "Workspace name required",
        description: "Please enter a name for your workspace.",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(trimmedName);
  };

  const handleDeleteWorkspace = (workspace: Workspace) => {
    setWorkspaceToDelete(workspace);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (workspaceToDelete) {
      deleteMutation.mutate(workspaceToDelete.id);
    }
  };

  const handleOpenWorkspace = (workspaceId: string) => {
    navigate(`/ide/${workspaceId}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4">
          <Code2 className="w-16 h-16 mx-auto text-primary animate-pulse" />
          <p className="text-muted-foreground">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">My Workspaces</h1>
            <p className="text-muted-foreground">
              Manage your projects and start coding
            </p>
          </div>
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg" data-testid="button-create-workspace">
                <Plus className="w-5 h-5 mr-2" />
                New Workspace
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dialog-create-workspace">
              <DialogHeader>
                <DialogTitle>Create New Workspace</DialogTitle>
                <DialogDescription>
                  Give your workspace a name to get started.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">Workspace Name</Label>
                  <Input
                    id="workspace-name"
                    data-testid="input-workspace-name"
                    placeholder="My Awesome Project"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateWorkspace();
                      }
                    }}
                    autoFocus
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  data-testid="button-cancel-create"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateWorkspace}
                  disabled={createMutation.isPending}
                  data-testid="button-confirm-create"
                >
                  {createMutation.isPending ? "Creating..." : "Create Workspace"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Workspace Grid */}
        {workspaces.length === 0 ? (
          <div className="text-center py-16">
            <FolderOpen className="w-24 h-24 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-semibold mb-2">No workspaces yet</h2>
            <p className="text-muted-foreground mb-6">
              Create your first workspace to start building
            </p>
            <Button
              size="lg"
              onClick={() => setCreateDialogOpen(true)}
              data-testid="button-create-first-workspace"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create Your First Workspace
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workspaces.map((workspace) => (
              <Card
                key={workspace.id}
                className="hover-elevate cursor-pointer"
                onClick={() => handleOpenWorkspace(workspace.id)}
                data-testid={`card-workspace-${workspace.id}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="truncate" data-testid={`text-workspace-name-${workspace.id}`}>
                        {workspace.name}
                      </CardTitle>
                      <CardDescription data-testid={`text-workspace-date-${workspace.id}`}>
                        Created {formatDistanceToNow(new Date(workspace.createdAt), { addSuffix: true })}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteWorkspace(workspace);
                      }}
                      data-testid={`button-delete-${workspace.id}`}
                      className="flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Code2 className="w-4 h-4" />
                    <span>Development environment</span>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenWorkspace(workspace.id);
                    }}
                    data-testid={`button-open-${workspace.id}`}
                  >
                    Open Workspace
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent data-testid="dialog-delete-workspace">
            <DialogHeader>
              <DialogTitle>Delete Workspace</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{workspaceToDelete?.name}"? This action cannot be undone and all files will be permanently removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDelete}
                disabled={deleteMutation.isPending}
                variant="destructive"
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete Workspace"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
