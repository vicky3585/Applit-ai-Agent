import { useState } from "react";
import SettingsModal from "../SettingsModal";
import { Button } from "@/components/ui/button";

export default function SettingsModalExample() {
  const [open, setOpen] = useState(true);

  return (
    <div className="p-8">
      <Button onClick={() => setOpen(true)}>Open Settings</Button>
      <SettingsModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
