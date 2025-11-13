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
      <div className="h-full flex items-center justify-center p-6 bg-muted/30">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="ml-2">
            <p className="font-semibold mb-2">code-server Unavailable</p>
            <p className="text-sm mb-3">{error}</p>
            <p className="text-xs text-muted-foreground">
              code-server requires Docker deployment. Using the custom editor on Replit.
            </p>
          </AlertDescription>
        </Alert>
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
