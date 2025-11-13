import { useState, useEffect } from "react";
import { X, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SettingsModalProps {
  open?: boolean;
  onClose?: () => void;
  workspaceId: string;
}

export default function SettingsModal({ open = false, onClose, workspaceId }: SettingsModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<{ configured: boolean; keyType: string } | null>(null);
  const [settings, setSettings] = useState({
    modelProvider: "openai",
    extendedThinking: false,
    localFirst: false,
    autoFix: true,
    maxIterations: "5",
    fontSize: "14",
    autoSave: true,
  });

  useEffect(() => {
    if (open) {
      loadSettings();
      loadApiKeyStatus();
    }
  }, [open, workspaceId]);

  const loadSettings = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/settings`);
      const data = await response.json();
      if (data && data.modelProvider) {
        setSettings({
          modelProvider: data.modelProvider || "openai",
          extendedThinking: data.extendedThinking === "true",
          localFirst: data.localFirst === "true",
          autoFix: data.autoFix === "true",
          maxIterations: data.maxIterations || "5",
          fontSize: data.fontSize || "14",
          autoSave: data.autoSave === "true",
        });
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const loadApiKeyStatus = async () => {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/api-key-status`);
      const data = await response.json();
      setApiKeyStatus(data);
    } catch (error) {
      console.error("Failed to load API key status:", error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await fetch(`/api/workspaces/${workspaceId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelProvider: settings.modelProvider,
          extendedThinking: String(settings.extendedThinking),
          localFirst: String(settings.localFirst),
          autoFix: String(settings.autoFix),
          maxIterations: settings.maxIterations,
          fontSize: settings.fontSize,
          autoSave: String(settings.autoSave),
        }),
      });
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated.",
      });
      onClose?.();
    } catch (error) {
      toast({
        title: "Failed to save settings",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* AI Model Section */}
          <div>
            <h3 className="text-sm font-semibold mb-4">AI Model</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="model-select">Model Provider</Label>
                <Select 
                  value={settings.modelProvider}
                  onValueChange={(value) => setSettings({ ...settings, modelProvider: value })}
                >
                  <SelectTrigger id="model-select" data-testid="select-model-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="openai">OpenAI GPT-4</SelectItem>
                    <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                    <SelectItem value="local">Local Model (vLLM)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>OpenAI API Key Status</Label>
                {apiKeyStatus ? (
                  <Alert className={apiKeyStatus.configured && apiKeyStatus.keyType === 'valid' ? "border-green-500" : "border-yellow-500"}>
                    {apiKeyStatus.configured && apiKeyStatus.keyType === 'valid' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                    )}
                    <AlertDescription className="ml-2">
                      {apiKeyStatus.configured && apiKeyStatus.keyType === 'valid' ? (
                        <span className="text-green-600">API key configured and valid (starts with sk-)</span>
                      ) : apiKeyStatus.configured && apiKeyStatus.keyType === 'invalid' ? (
                        <div>
                          <p className="font-medium text-yellow-600">Invalid API key detected</p>
                          <p className="text-sm mt-1">Your API key must start with "sk-", not "proj-".</p>
                          <p className="text-sm mt-1">Please update it in Replit Secrets.</p>
                        </div>
                      ) : (
                        <div>
                          <p className="font-medium">No API key configured</p>
                          <p className="text-sm mt-1">To use AI features, add your OpenAI API key:</p>
                          <ol className="text-sm mt-2 ml-4 list-decimal space-y-1">
                            <li>Click the Secrets tool (🔒) in the left sidebar</li>
                            <li>Find or create "OPENAI_API_KEY"</li>
                            <li>Paste your API key (starts with sk-)</li>
                            <li>Save and reload the page</li>
                          </ol>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="text-sm text-muted-foreground">Loading...</div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Agent Behavior Section */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Agent Behavior</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="extended-thinking">Extended Thinking</Label>
                  <p className="text-xs text-muted-foreground">
                    Allow the agent more time to reason
                  </p>
                </div>
                <Switch 
                  id="extended-thinking" 
                  checked={settings.extendedThinking}
                  onCheckedChange={(checked) => setSettings({ ...settings, extendedThinking: checked })}
                  data-testid="switch-extended-thinking" 
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="local-first">Local-First Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Prefer local models over cloud
                  </p>
                </div>
                <Switch 
                  id="local-first" 
                  checked={settings.localFirst}
                  onCheckedChange={(checked) => setSettings({ ...settings, localFirst: checked })}
                  data-testid="switch-local-first" 
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-fix">Auto-Fix</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically fix failing tests
                  </p>
                </div>
                <Switch 
                  id="auto-fix" 
                  checked={settings.autoFix}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoFix: checked })}
                  data-testid="switch-auto-fix" 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-iterations">Max Iterations</Label>
                <Select 
                  value={settings.maxIterations}
                  onValueChange={(value) => setSettings({ ...settings, maxIterations: value })}
                >
                  <SelectTrigger id="max-iterations" data-testid="select-max-iterations">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Editor Section */}
          <div>
            <h3 className="text-sm font-semibold mb-4">Editor</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="font-size">Font Size</Label>
                <Select 
                  value={settings.fontSize}
                  onValueChange={(value) => setSettings({ ...settings, fontSize: value })}
                >
                  <SelectTrigger id="font-size" data-testid="select-font-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12px</SelectItem>
                    <SelectItem value="14">14px</SelectItem>
                    <SelectItem value="16">16px</SelectItem>
                    <SelectItem value="18">18px</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-save">Auto Save</Label>
                  <p className="text-xs text-muted-foreground">
                    Save files automatically
                  </p>
                </div>
                <Switch 
                  id="auto-save" 
                  checked={settings.autoSave}
                  onCheckedChange={(checked) => setSettings({ ...settings, autoSave: checked })}
                  data-testid="switch-auto-save" 
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-settings">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading} data-testid="button-save-settings">
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
