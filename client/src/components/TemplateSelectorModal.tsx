import { useState } from "react";
import { FileCode, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Template {
  id: string;
  name: string;
  description: string;
  category: "frontend" | "backend" | "fullstack";
  language: string;
  framework: string;
  icon: string;
  devCommand?: string;
  buildCommand?: string;
}

interface TemplateSelectorModalProps {
  open?: boolean;
  onClose?: () => void;
  workspaceId: string;
}

export default function TemplateSelectorModal({
  open = false,
  onClose,
  workspaceId,
}: TemplateSelectorModalProps) {
  const { toast } = useToast();
  const [selectedCategory, setSelectedCategory] = useState<"all" | "frontend" | "backend" | "fullstack">("all");

  // Fetch available templates
  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
    enabled: open, // Only fetch when modal is open
  });

  // Apply template mutation
  const applyMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return apiRequest("POST", `/api/workspaces/${workspaceId}/apply-template`, {
        templateId,
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Template Applied",
        description: `${data.template?.name || "Template"} has been applied successfully. ${data.filesCreated} files created.`,
      });
      
      // Invalidate file list to refresh
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/files`] });
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${workspaceId}/packages`] });
      
      // Close modal after successful application
      onClose?.();
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.error || error.message || "Failed to apply template";
      toast({
        title: "Template Application Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleApplyTemplate = (templateId: string) => {
    applyMutation.mutate(templateId);
  };

  const filteredTemplates = selectedCategory === "all" 
    ? templates 
    : templates.filter(t => t.category === selectedCategory);

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "frontend":
        return "text-blue-600 dark:text-blue-400";
      case "backend":
        return "text-green-600 dark:text-green-400";
      case "fullstack":
        return "text-purple-600 dark:text-purple-400";
      default:
        return "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <DialogTitle>Choose a Template</DialogTitle>
          </div>
          <DialogDescription>
            Start your project with a pre-configured template
          </DialogDescription>
        </DialogHeader>

        <Tabs 
          value={selectedCategory} 
          onValueChange={(value: any) => setSelectedCategory(value)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all" data-testid="tab-all-templates">
              All
            </TabsTrigger>
            <TabsTrigger value="frontend" data-testid="tab-frontend-templates">
              Frontend
            </TabsTrigger>
            <TabsTrigger value="backend" data-testid="tab-backend-templates">
              Backend
            </TabsTrigger>
            <TabsTrigger value="fullstack" data-testid="tab-fullstack-templates">
              Fullstack
            </TabsTrigger>
          </TabsList>

          {/* Render separate TabsContent for each category */}
          {(["all", "frontend", "backend", "fullstack"] as const).map((category) => {
            const categoryTemplates = category === "all" 
              ? templates 
              : templates.filter(t => t.category === category);

            return (
              <TabsContent 
                key={category}
                value={category} 
                className="flex-1 overflow-auto mt-4"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : categoryTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <FileCode className="w-12 h-12 mb-4" />
                    <p>No templates found in this category</p>
                  </div>
                ) : (
                  <ScrollArea className="h-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-4">
                      {categoryTemplates.map((template) => (
                        <div
                          key={template.id}
                          className="border rounded-lg p-4 hover-elevate"
                          data-testid={`template-card-${template.id}`}
                        >
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="text-3xl" data-testid={`template-icon-${template.id}`}>
                                {template.icon}
                              </div>
                              <div>
                                <h3 
                                  className="font-semibold text-base"
                                  data-testid={`template-name-${template.id}`}
                                >
                                  {template.name}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                  {template.framework}
                                </p>
                              </div>
                            </div>
                            <Badge 
                              variant="outline" 
                              className={getCategoryColor(template.category)}
                              data-testid={`template-category-${template.id}`}
                            >
                              {template.category}
                            </Badge>
                          </div>

                          <p 
                            className="text-sm text-muted-foreground mb-4 line-clamp-2"
                            data-testid={`template-description-${template.id}`}
                          >
                            {template.description}
                          </p>

                          <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {template.language}
                              </Badge>
                              {template.devCommand && (
                                <Badge variant="outline" className="text-xs">
                                  {template.devCommand.split(" ")[0]}
                                </Badge>
                              )}
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleApplyTemplate(template.id)}
                              disabled={applyMutation.isPending}
                              data-testid={`button-apply-${template.id}`}
                            >
                              {applyMutation.isPending ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Applying...
                                </>
                              ) : (
                                "Apply"
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
