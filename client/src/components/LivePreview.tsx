import { useState, useEffect } from "react";
import { Loader2, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface LivePreviewProps {
  port?: number;
  className?: string;
}

export default function LivePreview({ port = 3000, className = "" }: LivePreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState("/preview");
  const [key, setKey] = useState(0); // Force iframe reload

  const handleLoad = () => {
    setLoading(false);
    setError(null);
  };

  const handleError = () => {
    setLoading(false);
    setError("Preview server not running. Start your dev server in the terminal.");
  };

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    setKey((prev) => prev + 1);
  };

  const openInNewTab = () => {
    window.open(previewUrl, "_blank");
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Preview toolbar */}
      <div className="flex items-center justify-between gap-2 p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs text-muted-foreground font-mono truncate">
            {previewUrl}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
            data-testid="button-preview-refresh"
            className="h-7 px-2"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={openInNewTab}
            data-testid="button-preview-external"
            className="h-7 px-2"
          >
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Preview content */}
      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading preview...</p>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center p-6 bg-muted/30">
            <Alert variant="default" className="max-w-md">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2">
                <p className="font-semibold mb-2">Preview Not Available</p>
                <p className="text-sm mb-3">{error}</p>
                <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                  <p>To see your app:</p>
                  <ol className="list-decimal list-inside space-y-1 ml-2">
                    <li>Start a dev server in the terminal (e.g., <code className="bg-muted px-1 rounded">npm run dev</code>)</li>
                    <li>Make sure it binds to port 3000</li>
                    <li>Click refresh above to reload</li>
                  </ol>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        )}
        <iframe
          key={key}
          src={previewUrl}
          className="w-full h-full border-0"
          onLoad={handleLoad}
          onError={handleError}
          title="Live Preview"
          data-testid="iframe-live-preview"
          sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-modals allow-popups allow-pointer-lock"
        />
      </div>
    </div>
  );
}
