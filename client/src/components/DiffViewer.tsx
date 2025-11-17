import { useState, useEffect } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DiffViewerProps {
  open: boolean;
  onClose: () => void;
  filePath: string;
  oldContent: string;
  newContent: string;
  oldVersion?: {
    version: string;
    capturedAt: string;
    changeType: string;
  };
}

export default function DiffViewer({
  open,
  onClose,
  filePath,
  oldContent,
  newContent,
  oldVersion,
}: DiffViewerProps) {
  // SSR-safe dark mode detection
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    }
  }, []);
  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        onClose();
      }
    }}>
      <DialogContent 
        className="max-w-6xl h-[85vh] flex flex-col p-0"
        data-testid="dialog-diff-viewer"
      >
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-2">
              <DialogTitle className="text-lg font-semibold">
                {filePath}
              </DialogTitle>
              {oldVersion && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    Version {oldVersion.version}
                  </Badge>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDistanceToNow(new Date(oldVersion.capturedAt), { addSuffix: true })}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {oldVersion.changeType}
                  </Badge>
                </div>
              )}
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              data-testid="button-close-diff"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-4 bg-muted/30">
          <ReactDiffViewer
            oldValue={oldContent}
            newValue={newContent}
            splitView={true}
            compareMethod={DiffMethod.WORDS}
            leftTitle="Previous Version"
            rightTitle="Current Version"
            styles={{
              variables: {
                light: {
                  diffViewerBackground: 'transparent',
                  addedBackground: 'hsl(142 76% 95%)',
                  addedColor: 'hsl(142 76% 20%)',
                  removedBackground: 'hsl(0 72% 95%)',
                  removedColor: 'hsl(0 72% 20%)',
                  wordAddedBackground: 'hsl(142 76% 85%)',
                  wordRemovedBackground: 'hsl(0 72% 85%)',
                  addedGutterBackground: 'hsl(142 76% 90%)',
                  removedGutterBackground: 'hsl(0 72% 90%)',
                },
                dark: {
                  diffViewerBackground: 'transparent',
                  addedBackground: 'hsl(142 76% 15%)',
                  addedColor: 'hsl(142 76% 85%)',
                  removedBackground: 'hsl(0 72% 15%)',
                  removedColor: 'hsl(0 72% 85%)',
                  wordAddedBackground: 'hsl(142 76% 20%)',
                  wordRemovedBackground: 'hsl(0 72% 20%)',
                  addedGutterBackground: 'hsl(142 76% 18%)',
                  removedGutterBackground: 'hsl(0 72% 18%)',
                },
              },
              diffContainer: {
                borderRadius: '0.5rem',
                overflow: 'hidden',
                border: '1px solid hsl(var(--border))',
              },
              line: {
                fontSize: '13px',
                fontFamily: 'JetBrains Mono, monospace',
                lineHeight: '1.6',
              },
            }}
            useDarkTheme={isDarkMode}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
