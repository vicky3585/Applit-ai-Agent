import { useEffect } from 'react';

export type KeyboardShortcut = {
  id: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  category: string;
  handler: () => void;
  preventDefault?: boolean;
};

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Detect platform for cross-platform Ctrl/Cmd handling  
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      
      for (const shortcut of shortcuts) {
        // Key must match first
        if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) continue;
        
        // Determine which modifiers are pressed
        const hasCtrl = event.ctrlKey;
        const hasMeta = event.metaKey;
        const hasShift = event.shiftKey;
        const hasAlt = event.altKey;
        
        // For cross-platform ctrl shortcuts: use Ctrl on Win/Linux, Cmd on macOS
        const hasPlatformModifier = isMac ? hasMeta : hasCtrl;
        
        // Check each modifier requirement separately
        
        // Ctrl shortcuts (cross-platform: Ctrl on Win/Linux, Cmd on macOS)
        if (shortcut.ctrl) {
          if (!hasPlatformModifier) continue; // Required modifier missing
        } else {
          // If ctrl not required, reject if either Ctrl or Meta pressed (unless meta is specifically required)
          if (!shortcut.meta && (hasCtrl || hasMeta)) continue;
        }
        
        // Meta shortcuts (specifically require Command/Meta key)
        if (shortcut.meta) {
          if (!hasMeta) continue; // Required Meta key missing
        }
        
        // Shift modifier
        if (shortcut.shift) {
          if (!hasShift) continue; // Required Shift missing
        } else {
          if (hasShift) continue; // Unwanted Shift pressed
        }
        
        // Alt modifier
        if (shortcut.alt) {
          if (!hasAlt) continue; // Required Alt missing
        } else {
          if (hasAlt) continue; // Unwanted Alt pressed
        }
        
        // All checks passed - execute shortcut
        if (shortcut.preventDefault !== false) {
          event.preventDefault();
        }
        shortcut.handler();
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
}
