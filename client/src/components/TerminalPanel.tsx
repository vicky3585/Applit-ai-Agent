import { useState, useRef, useEffect } from "react";
import { Terminal, X, Plus, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface TerminalLine {
  id: string;
  type: "command" | "output" | "error";
  content: string;
}

interface TerminalPanelProps {
  lines?: TerminalLine[];
  onCommand?: (command: string) => void;
  onClear?: () => void;
}

export default function TerminalPanel({
  lines = [],
  onCommand,
  onClear,
}: TerminalPanelProps) {
  const [input, setInput] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onCommand?.(input);
      setInput("");
    }
  };

  return (
    <div className={`border-t bg-background flex flex-col ${isCollapsed ? "h-10" : "h-48"}`}>
      <div className="h-10 border-b bg-muted/30 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          <span className="text-sm font-medium">Terminal</span>
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={() => setIsCollapsed(!isCollapsed)}
            data-testid="button-collapse-terminal"
          >
            <ChevronUp className={`w-4 h-4 transition-transform ${isCollapsed ? "rotate-180" : ""}`} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={onClear}
            data-testid="button-clear-terminal"
          >
            <X className="w-4 h-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            data-testid="button-new-terminal"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          <ScrollArea className="flex-1 p-2 font-mono text-sm" ref={scrollRef}>
            <div className="space-y-1">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className={`
                    ${line.type === "command" ? "text-primary" : ""}
                    ${line.type === "error" ? "text-destructive" : ""}
                    ${line.type === "output" ? "text-foreground" : ""}
                  `}
                  data-testid={`terminal-line-${line.id}`}
                >
                  {line.type === "command" && "$ "}
                  {line.content}
                </div>
              ))}
            </div>
          </ScrollArea>

          <div className="border-t p-2">
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              <span className="text-sm font-mono text-primary">$</span>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Enter command..."
                className="flex-1 h-8 font-mono text-sm border-0 focus-visible:ring-0 bg-transparent"
                data-testid="input-terminal-command"
              />
            </form>
          </div>
        </>
      )}
    </div>
  );
}
