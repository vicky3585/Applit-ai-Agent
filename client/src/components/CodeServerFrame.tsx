import { useState, useEffect } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface CodeServerFrameProps {
  workspaceId: string;
  className?: string;
}

export default function CodeServerFrame({ workspaceId, className = "" }: CodeServerFrameProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    // Check if code-server is available
    fetch("/api/health")
      .then((res) => res.json())
      .then((health) => {
        const codeServerAvailable = health.services?.codeServer?.configured;
        setAvailable(codeServerAvailable);
        if (!codeServerAvailable) {
          setError("code-server not available - running in Replit mode");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to check code-server availability");
        setLoading(false);
      });
  }, []);

  const handleLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleError = () => {
    setLoading(false);
    setError("Failed to load code-server. Is it running?");
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading code-server...</p>
        </div>
      </div>
    );
  }

  if (error || !available) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-background">
        <div className="max-w-lg text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z"/>
            </svg>
          </div>
          
          <h3 className="text-xl font-semibold mb-2">VS Code Integration</h3>
          
          <p className="text-sm text-muted-foreground mb-6">
            Connect your local VS Code to this workspace for a powerful development experience.
          </p>

          <div className="bg-muted/50 rounded-lg p-4 mb-4 text-left">
            <p className="text-sm font-medium mb-2">How to Connect:</p>
            <ol className="text-sm text-muted-foreground space-y-2">
              <li className="flex gap-2">
                <span className="font-mono text-primary">1.</span>
                <span>Install the "Remote - SSH" extension in VS Code</span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-primary">2.</span>
                <span>Open the SSH panel in your Replit workspace settings</span>
              </li>
              <li className="flex gap-2">
                <span className="font-mono text-primary">3.</span>
                <span>Click "Launch VS Code" to connect automatically</span>
              </li>
            </ol>
          </div>

          <div className="text-xs text-muted-foreground">
            <p>For now, use the built-in code editor which includes syntax highlighting, autocomplete, and file management.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}
      <iframe
        src="/code-server"
        className="w-full h-full border-0"
        onLoad={handleLoad}
        onError={handleError}
        title="code-server"
        data-testid="iframe-code-server"
        sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-modals allow-popups allow-pointer-lock"
      />
    </div>
  );
}
