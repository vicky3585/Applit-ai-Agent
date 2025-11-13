import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, XCircle, Package } from "lucide-react";

interface PackageInstall {
  id: string;
  packageManager: "npm" | "pip" | "apt";
  packages: string[];
  status: "pending" | "installing" | "completed" | "failed";
  logs: string[];
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

export function PackageInstallation({ installations }: { installations: PackageInstall[] }) {
  const activeInstalls = installations.filter(
    (i) => i.status === "installing" || i.status === "pending"
  );
  const recentInstalls = installations.slice(0, 10);

  return (
    <div className="flex flex-col h-full" data-testid="panel-package-installation">
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Package Manager</h2>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Track package installation progress
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {activeInstalls.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Active Installations
              </h3>
              {activeInstalls.map((install) => (
                <InstallCard key={install.id} install={install} />
              ))}
            </div>
          )}

          {recentInstalls.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground">
                Recent Installations
              </h3>
              {recentInstalls.map((install) => (
                <InstallCard key={install.id} install={install} />
              ))}
            </div>
          )}

          {installations.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No package installations yet</p>
              <p className="text-xs mt-1">
                Installations will appear here when the AI agent installs packages
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function InstallCard({ install }: { install: PackageInstall }) {
  const [expanded, setExpanded] = useState(false);

  const getStatusIcon = () => {
    switch (install.status) {
      case "installing":
      case "pending":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case "completed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-destructive" />;
    }
  };

  const getStatusBadge = () => {
    switch (install.status) {
      case "installing":
        return <Badge variant="default" className="text-xs">Installing</Badge>;
      case "pending":
        return <Badge variant="secondary" className="text-xs">Pending</Badge>;
      case "completed":
        return <Badge variant="outline" className="text-xs border-green-500 text-green-500">Completed</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-xs">Failed</Badge>;
    }
  };

  const duration = install.completedAt
    ? Math.round((install.completedAt.getTime() - install.startedAt.getTime()) / 1000)
    : null;

  return (
    <Card
      className="cursor-pointer hover-elevate active-elevate-2"
      onClick={() => setExpanded(!expanded)}
      data-testid={`install-card-${install.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            {getStatusIcon()}
            <div className="flex-1 min-w-0">
              <CardTitle className="text-sm">
                {install.packageManager} install
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {install.packages.join(", ")}
              </CardDescription>
            </div>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>

      {(expanded || install.status === "installing") && (
        <CardContent className="pt-0">
          <ScrollArea className="h-32 rounded border bg-muted/50 p-2">
            <div className="font-mono text-xs space-y-1">
              {install.logs.length > 0 ? (
                install.logs.map((log, idx) => (
                  <div key={idx} className="text-muted-foreground">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground">Waiting for output...</div>
              )}
            </div>
          </ScrollArea>

          {install.error && (
            <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
              {install.error}
            </div>
          )}

          {duration !== null && (
            <div className="mt-2 text-xs text-muted-foreground">
              Completed in {duration}s
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
