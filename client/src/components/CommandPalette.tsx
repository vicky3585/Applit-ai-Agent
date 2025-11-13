import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Command } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fuzzySearch } from "@/lib/fuzzy";

export type CommandItem = {
  id: string;
  label: string;
  description?: string;
  category: string;
  shortcut?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
};

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: CommandItem[];
};

export function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use fuzzy search for better matching
  const filteredCommands = fuzzySearch(
    search,
    commands,
    (command) => [command.label, command.description || "", command.category]
  );

  const groupedCommands = filteredCommands.reduce((acc, command) => {
    if (!acc[command.category]) {
      acc[command.category] = [];
    }
    acc[command.category].push(command);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (filteredCommands.length > 0 && selectedIndex >= filteredCommands.length) {
      setSelectedIndex(filteredCommands.length - 1);
    }
  }, [filteredCommands.length, selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
      e.preventDefault();
      filteredCommands[selectedIndex].onSelect();
      onOpenChange(false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-2xl" data-testid="dialog-command-palette">
        <div className="flex items-center gap-2 px-4 pt-4">
          <Command className="w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="border-0 focus-visible:ring-0 px-0"
            data-testid="input-command-search"
          />
        </div>

        <ScrollArea className="max-h-[400px]">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground" data-testid="text-no-results">
              No commands found
            </div>
          ) : (
            <div className="py-2">
              {Object.entries(groupedCommands).map(([category, items]) => (
                <div key={category} className="mb-2">
                  <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase" data-testid={`text-category-${category}`}>
                    {category}
                  </div>
                  {items.map((command, index) => {
                    const globalIndex = filteredCommands.indexOf(command);
                    const isSelected = globalIndex === selectedIndex;

                    return (
                      <button
                        key={command.id}
                        onClick={() => {
                          command.onSelect();
                          onOpenChange(false);
                        }}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`w-full px-4 py-2 flex items-center justify-between text-left hover-elevate ${
                          isSelected ? "toggle-elevate toggle-elevated" : ""
                        }`}
                        data-testid={`button-command-${command.id}`}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {command.icon && (
                            <div className="text-muted-foreground flex-shrink-0">{command.icon}</div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm" data-testid={`text-command-label-${command.id}`}>
                              {command.label}
                            </div>
                            {command.description && (
                              <div className="text-xs text-muted-foreground truncate">
                                {command.description}
                              </div>
                            )}
                          </div>
                        </div>
                        {command.shortcut && (
                          <Badge variant="outline" className="ml-2 text-xs flex-shrink-0">
                            {command.shortcut}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="px-4 py-2 border-t text-xs text-muted-foreground flex items-center gap-4">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted">↑↓</kbd> Navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted">Enter</kbd> Select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-muted">Esc</kbd> Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
