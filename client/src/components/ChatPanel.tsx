import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import AgentWorkflowCard from "@/components/AgentWorkflowCard";
import { AgentWorkflowState } from "@shared/schema";

interface Message {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  messages?: Message[];
  onSendMessage?: (content: string) => void;
  onGenerateWithAI?: (prompt: string) => void;
  isStreaming?: boolean;
  streamingMessage?: string;
  agentWorkflow?: AgentWorkflowState | null;
  onFileClick?: (path: string) => void;
}

export default function ChatPanel({
  messages = [],
  onSendMessage,
  onGenerateWithAI,
  isStreaming = false,
  streamingMessage = "",
  agentWorkflow = null,
  onFileClick,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Only disable during processing - always allow retry after complete/failed
  const isGenerating = agentWorkflow?.status === "processing";
  const hasFailed = agentWorkflow?.status === "failed";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingMessage]);

  const handleSend = () => {
    if (input.trim() && !isStreaming && !isGenerating) {
      onSendMessage?.(input);
      setInput("");
    }
  };

  const handleGenerateWithAI = () => {
    if (input.trim() && !isGenerating) {
      onGenerateWithAI?.(input);
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter for AI generation
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerateWithAI();
    }
    // Regular Enter for chat message
    else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="h-10 border-b flex items-center px-4">
        <Bot className="w-4 h-4 mr-2 text-primary" />
        <span className="text-sm font-medium">AI Assistant</span>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
              data-testid={`message-${message.id}`}
            >
              {message.role === "agent" && (
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Bot className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              )}
              
              <div
                className={`
                  max-w-[80%] rounded-lg px-4 py-2 text-sm
                  ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }
                `}
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                <p className="text-xs opacity-70 mt-1">
                  {message.timestamp.toLocaleTimeString()}
                </p>
              </div>

              {message.role === "user" && (
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-accent">
                    <User className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}
          
          {/* Agent workflow state (inline during generation) */}
          {agentWorkflow && agentWorkflow.status !== "idle" && (
            <div className="flex gap-3" data-testid="workflow-container">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  <Bot className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <AgentWorkflowCard 
                  workflowState={agentWorkflow}
                  onFileClick={onFileClick}
                />
              </div>
            </div>
          )}
          
          {isStreaming && streamingMessage && (
            <div className="flex gap-3" data-testid="streaming-message">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  <Bot className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted/60 border border-muted">
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Agent Working...</span>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono">
                  {streamingMessage}
                </p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t p-4">
        <div className="space-y-2">
          {/* Error message when agent fails */}
          {hasFailed && agentWorkflow?.errors && agentWorkflow.errors.length > 0 && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20" data-testid="error-message">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">Agent Failed</p>
                  <p className="text-xs text-destructive/80 mt-1">
                    {agentWorkflow.errors[0]}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    You can retry by sending a new message or refining your request.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Generate with AI button (shown above input) */}
          {onGenerateWithAI && input.trim() && !isGenerating && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateWithAI}
              className="w-full gap-2"
              data-testid="button-generate-ai"
            >
              <Sparkles className="w-4 h-4" />
              Generate with AI (Ctrl+Enter)
            </Button>
          )}
          
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the AI agent to help with your code... (Ctrl+Enter to generate)"
              className="min-h-24 resize-none"
              disabled={isStreaming || isGenerating}
              data-testid="textarea-chat-input"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming || isGenerating}
              className="h-24"
              data-testid="button-send-message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
