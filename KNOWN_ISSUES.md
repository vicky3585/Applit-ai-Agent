# Known Issues & Limitations

## WebSocket Warnings on Replit

### Vite HMR WebSocket Warning

**Issue**: Browser console shows WebSocket error:
```
Failed to construct 'WebSocket': The URL 'wss://localhost:undefined/?token=...' is invalid
```

**Cause**: Vite's Hot Module Replacement (HMR) client tries to establish a WebSocket connection to `localhost:undefined` on Replit.

**Impact**: **None** - This is a cosmetic warning that doesn't affect IDE functionality:
- ✅ IDE loads and works correctly
- ✅ File editing and saving works
- ✅ Templates apply successfully
- ✅ Preview pane functions properly
- ✅ IDE WebSockets (`/ws`, `/yjs/*`) work correctly
- ✅ Replit's own HMR infrastructure (@replit/vite-plugin-cartographer) handles dev experience

**Workaround**: None needed - the warning can be safely ignored on Replit.

**Resolution**: On **local Ubuntu**, this warning does not appear because Vite HMR works natively. The warning only occurs on Replit where Vite configuration files are protected to prevent breaking changes.

---

## Environment-Specific Behavior

### Dev Server Auto-Start (Tasks 2-6)

**Replit Environment**:
- Dev servers do NOT auto-start (Docker not available)
- Shows message: "Template ready - start dev server manually in Terminal"
- Preview falls back to static file serving
- ✅ All files are saved to disk for manual dev server start

**Local Ubuntu Environment**:
- ✅ Dev servers auto-start via Docker sandbox
- ✅ Preview proxies to dev server with WebSocket HMR
- ✅ Full live development experience

---

## Testing on Local Ubuntu

To test auto-start dev server functionality (Tasks 2-6), you must run on **local Ubuntu with Docker**:

### Prerequisites
```bash
# 1. Docker installed and running
sudo systemctl start docker

# 2. Environment variable
export ENV=local  # or leave unset (defaults to local)

# 3. PostgreSQL running
sudo systemctl start postgresql
```

### Run Application
```bash
npm run dev
```

### Expected Behavior
1. Apply React + Vite template
2. Files save to `/tmp/workspaces/{workspaceId}/`
3. Dev server auto-starts on random port (e.g., 5173)
4. Preview automatically proxies to dev server
5. WebSocket upgrades work for Vite HMR
6. File edits trigger hot reload

### Verification
- Check logs for: `[Templates] Dev server started on port XXXX`
- Preview shows running Vite app (not static HTML)
- Edit `App.tsx` → Changes appear instantly without refresh
- No "start manually" message appears

---

## Architecture Notes

### File Persistence
- `FilePersistence.saveFile()` and `readFile()` work on all environments
- `enableSync` flag only controls background sync, not explicit operations
- Files always written to disk for preview and manual dev server start

### Environment Detection
```typescript
// Replit: REPL_ID environment variable exists
// Local: REPL_ID not set (or DEPLOYMENT_ENV=local)
const env = detectEnvironment();  // 'replit' | 'local'
```

### Preview Routing
1. Check for running dev server
2. If exists: Proxy requests + WebSocket upgrades
3. If not: Static file serving using FilePersistence.readFile()

---

Last Updated: November 14, 2025
