import { useState } from "react";
import { Package, Search, Trash2, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PackageManagerModalProps {
  open?: boolean;
  onClose?: () => void;
  workspaceId: string;
}

export default function PackageManagerModal({
  open = false,
  onClose,
  workspaceId,
}: PackageManagerModalProps) {
  const { toast } = useToast();
  const [packageManager, setPackageManager] = useState<"npm" | "pip" | "apt">("npm");
  const [searchQuery, setSearchQuery] = useState("");
  const [packageName, setPackageName] = useState("");

  // Fetch installed packages
  const { data: installedPackages = [] } = useQuery<any[]>({
    queryKey: [`/api/workspaces/${workspaceId}/packages`],
    enabled: open, // Only fetch when modal is open
  });

  // Install package mutation
  const installMutation = useMutation({
    mutationFn: async (pkgName: string) => {
      return apiRequest("POST", `/api/workspaces/${workspaceId}/packages/install`, {
        packages: [pkgName.trim()],
        packageManager,
      });
    },
    onSuccess: () => {
      toast({
        title: "Package Installed",
        description: `${packageName} has been installed successfully.`,
      });
      setPackageName("");
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/packages`] });
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || error.message || "Failed to install package";
      toast({
        title: "Installation Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Uninstall package mutation
  const uninstallMutation = useMutation({
    mutationFn: async (packageId: string) => {
      return apiRequest("DELETE", `/api/workspaces/${workspaceId}/packages/${packageId}`);
    },
    onSuccess: (_, packageId) => {
      const pkg = installedPackages.find((p: any) => p.id === packageId);
      toast({
        title: "Package Uninstalled",
        description: `${pkg?.name} has been uninstalled.`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/packages`] });
    },
    onError: (error: any) => {
      toast({
        title: "Uninstall Failed",
        description: error.message || "Failed to uninstall package.",
        variant: "destructive",
      });
    },
  });

  const handleInstall = () => {
    if (!packageName.trim()) {
      toast({
        title: "Package name required",
        description: "Please enter a package name to install.",
        variant: "destructive",
      });
      return;
    }
    installMutation.mutate(packageName);
  };

  const handleUninstall = (pkg: any) => {
    uninstallMutation.mutate(pkg.id);
  };

  const filteredPackages = installedPackages.filter(
    (pkg) =>
      pkg.packageManager === packageManager &&
      (!searchQuery || pkg.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            <DialogTitle>Package Manager</DialogTitle>
          </div>
        </DialogHeader>

        <Tabs defaultValue="install" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="install" data-testid="tab-install">
              Install Packages
            </TabsTrigger>
            <TabsTrigger value="installed" data-testid="tab-installed">
              Installed ({installedPackages.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="install" className="flex-1 overflow-auto space-y-4 mt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="package-manager">Package Manager</Label>
                <Select
                  value={packageManager}
                  onValueChange={(value: any) => setPackageManager(value)}
                >
                  <SelectTrigger id="package-manager" data-testid="select-package-manager">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="npm">npm (Node.js)</SelectItem>
                    <SelectItem value="pip">pip (Python)</SelectItem>
                    <SelectItem value="apt">apt (System)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="package-name">Package Name</Label>
                <div className="flex gap-2">
                  <Input
                    id="package-name"
                    placeholder={
                      packageManager === "npm"
                        ? "e.g., express, react, lodash"
                        : packageManager === "pip"
                        ? "e.g., flask, numpy, pandas"
                        : "e.g., curl, git, vim"
                    }
                    value={packageName}
                    onChange={(e) => setPackageName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInstall()}
                    data-testid="input-package-name"
                  />
                  <Button
                    onClick={handleInstall}
                    disabled={installMutation.isPending || !packageName.trim()}
                    data-testid="button-install-package"
                  >
                    {installMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Installing...
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Install
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {packageManager === "npm"
                    ? "Install Node.js packages from npm registry"
                    : packageManager === "pip"
                    ? "Install Python packages from PyPI"
                    : "Install system packages (requires sudo)"}
                </p>
              </div>

              {packageManager === "npm" && (
                <div className="p-4 rounded-lg border bg-muted/50">
                  <h4 className="text-sm font-medium mb-2">Popular Packages</h4>
                  <div className="flex flex-wrap gap-2">
                    {["express", "react", "lodash", "axios", "dotenv", "typescript"].map(
                      (pkg) => (
                        <Badge
                          key={pkg}
                          className="cursor-pointer hover-elevate"
                          onClick={() => setPackageName(pkg)}
                          data-testid={`badge-popular-${pkg}`}
                        >
                          {pkg}
                        </Badge>
                      )
                    )}
                  </div>
                </div>
              )}

              {packageManager === "pip" && (
                <div className="p-4 rounded-lg border bg-muted/50">
                  <h4 className="text-sm font-medium mb-2">Popular Packages</h4>
                  <div className="flex flex-wrap gap-2">
                    {["flask", "fastapi", "numpy", "pandas", "requests", "pytest"].map(
                      (pkg) => (
                        <Badge
                          key={pkg}
                          className="cursor-pointer hover-elevate"
                          onClick={() => setPackageName(pkg)}
                          data-testid={`badge-popular-${pkg}`}
                        >
                          {pkg}
                        </Badge>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="installed" className="flex-1 overflow-hidden flex flex-col mt-4">
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search installed packages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-packages"
                />
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-2">
                {filteredPackages.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No packages installed</p>
                    <p className="text-xs mt-1">
                      Install packages from the Install tab
                    </p>
                  </div>
                ) : (
                  filteredPackages.map((pkg) => (
                    <div
                      key={pkg.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate"
                      data-testid={`package-${pkg.name}`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="text-sm font-medium">{pkg.name}</div>
                          {pkg.version && (
                            <div className="text-xs text-muted-foreground">
                              v{pkg.version}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {pkg.packageManager}
                        </Badge>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleUninstall(pkg)}
                        disabled={uninstallMutation.isPending}
                        data-testid={`button-uninstall-${pkg.name}`}
                      >
                        {uninstallMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={onClose} data-testid="button-close">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
