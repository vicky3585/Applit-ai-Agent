import { X } from "lucide-react";
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

interface SettingsModalProps {
  open?: boolean;
  onClose?: () => void;
}

export default function SettingsModal({ open = false, onClose }: SettingsModalProps) {
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
                <Select defaultValue="openai">
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
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  placeholder="sk-..."
                  data-testid="input-api-key"
                />
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
                <Switch id="extended-thinking" data-testid="switch-extended-thinking" />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="local-first">Local-First Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Prefer local models over cloud
                  </p>
                </div>
                <Switch id="local-first" data-testid="switch-local-first" />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-fix">Auto-Fix</Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically fix failing tests
                  </p>
                </div>
                <Switch id="auto-fix" defaultChecked data-testid="switch-auto-fix" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-iterations">Max Iterations</Label>
                <Select defaultValue="5">
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
                <Select defaultValue="14">
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
                <Switch id="auto-save" defaultChecked data-testid="switch-auto-save" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-settings">
            Cancel
          </Button>
          <Button onClick={onClose} data-testid="button-save-settings">
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
