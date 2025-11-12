import { useState } from "react";
import { X, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

interface EditorTab {
  id: string;
  name: string;
  content: string;
  language?: string;
  unsaved?: boolean;
}

interface CodeEditorProps {
  tabs?: EditorTab[];
  activeTabId?: string;
  onTabChange?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onContentChange?: (tabId: string, content: string) => void;
}

export default function CodeEditor({
  tabs = [],
  activeTabId,
  onTabChange,
  onTabClose,
  onContentChange,
}: CodeEditorProps) {
  const [activeTab, setActiveTab] = useState(activeTabId || tabs[0]?.id);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    onTabChange?.(tabId);
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    onTabClose?.(tabId);
  };

  const currentTab = tabs.find((tab) => tab.id === activeTab);

  return (
    <div className="flex-1 flex flex-col bg-background h-full">
      {/* Tab Bar */}
      <div className="h-10 border-b bg-muted/30 flex items-center overflow-x-auto">
        <ScrollArea className="flex-1">
          <div className="flex">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`
                  group flex items-center gap-2 px-4 h-10 border-r cursor-pointer min-w-32
                  ${activeTab === tab.id ? "bg-background" : "hover-elevate"}
                `}
                onClick={() => handleTabClick(tab.id)}
                data-testid={`tab-${tab.id}`}
              >
                <span className="text-sm truncate flex-1">
                  {tab.name}
                  {tab.unsaved && <span className="text-orange-500 ml-1">•</span>}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="w-5 h-5 opacity-0 group-hover:opacity-100"
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  data-testid={`button-close-tab-${tab.id}`}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
        <Button size="icon" variant="ghost" className="w-10 h-10 shrink-0">
          <MoreHorizontal className="w-4 h-4" />
        </Button>
      </div>

      {/* Editor Area */}
      <div className="flex-1 relative">
        {currentTab ? (
          <div className="absolute inset-0 flex">
            {/* Line Numbers */}
            <div className="w-12 bg-muted/20 border-r flex flex-col items-end pr-2 py-4 font-mono text-xs text-muted-foreground">
              {currentTab.content.split("\n").map((_, i) => (
                <div key={i} className="h-6 leading-6">
                  {i + 1}
                </div>
              ))}
            </div>

            {/* Code Content */}
            <Textarea
              className="flex-1 border-0 resize-none font-mono text-sm leading-6 p-4 focus-visible:ring-0"
              value={currentTab.content}
              onChange={(e) => onContentChange?.(currentTab.id, e.target.value)}
              placeholder="Start typing..."
              data-testid="textarea-code-editor"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">No file open</p>
          </div>
        )}
      </div>
    </div>
  );
}
