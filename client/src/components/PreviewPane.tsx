import { useState, useEffect, useRef } from "react";
import { RefreshCw, ExternalLink, AlertCircle, Loader2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface PreviewPaneProps {
  workspaceId: string;
  autoReload?: boolean;
}

export default function PreviewPane({ workspaceId, autoReload = true }: PreviewPaneProps) {
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    // Auto-detect preview URL based on environment
    detectPreviewUrl();
  }, [workspaceId]);

  // Hot reload - listen for file changes via WebSocket
  useEffect(() => {
    if (!autoReload) return;

    // This will be enhanced later with WebSocket connection
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && iframeRef.current) {
        // Refresh preview when tab becomes visible
        handleRefresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [autoReload]);

  const detectPreviewUrl = async () => {
    setLoading(true);
    setError(null);

    try {
      // Check if there's a dev server running
      const response = await fetch(`/api/workspaces/${workspaceId}/preview-url`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.url) {
          setPreviewUrl(data.url);
          setLoading(false);
          return;
        }
      }

      // Default: try common ports
      const currentHost = window.location.host;
      const protocol = window.location.protocol;
      
      // In Replit, the preview URL is the same host
      setPreviewUrl(`${protocol}//${currentHost}`);
      setLoading(false);
    } catch (err) {
      setError("Unable to detect preview URL. You can enter one manually below.");
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const handleOpenInNewTab = () => {
    if (previewUrl) {
      window.open(previewUrl, "_blank");
    }
  };

  const handleCustomUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customUrl.trim()) {
      setPreviewUrl(customUrl.trim());
      setError(null);
    }
  };

  const handleIframeLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleIframeError = () => {
    setLoading(false);
    setError("Failed to load preview. Make sure your app is running.");
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="h-10 border-b flex items-center px-4 gap-2">
        <Globe className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium flex-1">Preview</span>
        
        <Button
          size="icon"
          variant="ghost"
          onClick={handleRefresh}
          disabled={!previewUrl || loading}
          className="h-7 w-7"
          data-testid="button-refresh-preview"
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
        
        <Button
          size="icon"
          variant="ghost"
          onClick={handleOpenInNewTab}
          disabled={!previewUrl}
          className="h-7 w-7"
          data-testid="button-open-preview"
        >
          <ExternalLink className="w-3 h-3" />
        </Button>
      </div>

      {/* URL Bar */}
      <div className="border-b px-4 py-2">
        <form onSubmit={handleCustomUrlSubmit} className="flex gap-2">
          <Input
            value={customUrl || previewUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            placeholder="Enter preview URL or leave empty for auto-detect"
            className="h-8 text-xs font-mono"
            data-testid="input-preview-url"
          />
          {customUrl && (
            <Button type="submit" size="sm" className="h-8" data-testid="button-load-url">
              Load
            </Button>
          )}
        </form>
      </div>

      {/* Preview Content */}
      <div className="flex-1 relative bg-white dark:bg-black">
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <Alert className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error}
                <div className="mt-2 text-xs text-muted-foreground">
                  Tip: Make sure your app is running on the correct port and accessible.
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Loading preview...</span>
            </div>
          </div>
        )}

        {previewUrl && !error && (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            data-testid="iframe-preview"
          />
        )}

        {!previewUrl && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="text-center">
              <Globe className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">No Preview Available</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Generate an app with the AI agent to see a live preview here.
              </p>
              <p className="text-xs text-muted-foreground">
                Or enter a custom URL in the bar above.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
