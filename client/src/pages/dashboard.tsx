import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Plus, Trash2, FolderOpen, Code2, LogOut, Sparkles, Key } from "lucide-react";
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
  const { user } = useAuth();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<Workspace | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

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

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      navigate("/auth");
      toast({
        title: "Logged out successfully",
        description: "See you next time!",
      });
    },
  });

  // Password change mutation
  const passwordChangeMutation = useMutation({
    mutationFn: async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) => {
      const response = await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to change password" }));
        throw new Error(error.error || "Failed to change password");
      }
      return response.json();
    },
    onSuccess: () => {
      setPasswordDialogOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to change password",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleChangePassword = () => {
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast({
        title: "All fields required",
        description: "Please fill in all password fields.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "New password and confirmation don't match.",
        variant: "destructive",
      });
      return;
    }

    if (newPassword.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    passwordChangeMutation.mutate({ currentPassword, newPassword });
  };

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

  const getUserInitials = () => {
    if (!user) return "U";
    if (user.username) return user.username.substring(0, 2).toUpperCase();
    if (user.email) return user.email.substring(0, 2).toUpperCase();
    return "U";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <div className="text-center space-y-4">
          <Code2 className="w-16 h-16 mx-auto text-primary animate-pulse" />
          <p className="text-muted-foreground">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 flex flex-col">
      {/* Enhanced Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Code2 className="w-8 h-8 text-primary" />
                <Sparkles className="w-3 h-3 text-primary absolute -top-1 -right-1" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Applit</h1>
                <p className="text-xs text-muted-foreground">AI-Powered Development</p>
              </div>
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-3">
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="default" data-testid="button-create-workspace">
                    <Plus className="w-4 h-4 mr-2" />
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-user-menu">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {getUserInitials()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56" data-testid="dropdown-user-menu">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.username || "User"}</p>
                      <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem data-testid="menuitem-change-password" onClick={() => setPasswordDialogOpen(true)}>
                    <Key className="mr-2 h-4 w-4" />
                    <span>Change Password</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem data-testid="menuitem-logout" onClick={() => logoutMutation.mutate()}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 max-w-7xl flex-1">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-2">Your Workspaces</h2>
          <p className="text-muted-foreground">
            Manage your AI-powered development environments
          </p>
        </div>

        {/* Workspace Grid */}
        {workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted/50 p-8 mb-6">
              <FolderOpen className="w-16 h-16 text-muted-foreground" />
            </div>
            <h3 className="text-2xl font-semibold mb-2">No workspaces yet</h3>
            <p className="text-muted-foreground mb-8 max-w-md text-center">
              Get started by creating your first workspace. Each workspace is an isolated development environment powered by AI.
            </p>
            <Button
              size="lg"
              onClick={() => setCreateDialogOpen(true)}
              data-testid="button-create-first-workspace"
              className="shadow-lg"
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
                className="hover-elevate cursor-pointer transition-all duration-200 border-muted/50"
                onClick={() => handleOpenWorkspace(workspace.id)}
                data-testid={`card-workspace-${workspace.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="truncate flex items-center gap-2" data-testid={`text-workspace-name-${workspace.id}`}>
                        <Code2 className="w-4 h-4 text-primary flex-shrink-0" />
                        <span>{workspace.name}</span>
                      </CardTitle>
                      <CardDescription className="mt-1" data-testid={`text-workspace-date-${workspace.id}`}>
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
                      className="flex-shrink-0 h-8 w-8"
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pb-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Sparkles className="w-3 h-3" />
                    <span>AI-powered environment</span>
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

        {/* Password Change Dialog */}
        <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
          <DialogContent data-testid="dialog-change-password">
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
              <DialogDescription>
                Enter your current password and choose a new one.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  data-testid="input-current-password"
                  placeholder="Enter current password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleChangePassword();
                    }
                  }}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  data-testid="input-new-password"
                  placeholder="Enter new password (min 8 characters)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleChangePassword();
                    }
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  data-testid="input-confirm-password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleChangePassword();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setPasswordDialogOpen(false);
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                data-testid="button-cancel-password"
              >
                Cancel
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={passwordChangeMutation.isPending}
                data-testid="button-confirm-password"
              >
                {passwordChangeMutation.isPending ? "Changing..." : "Change Password"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      
      {/* Enhanced Footer */}
      <footer className="border-t bg-card/30 backdrop-blur-sm py-8 mt-auto">
        <div className="container mx-auto px-4 max-w-7xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary" />
              <span className="text-sm font-semibold">Applit</span>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                © {new Date().getFullYear()} <span className="font-semibold text-foreground">Flying Venture System</span>. All rights reserved.
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              AI-Powered Development Platform
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
