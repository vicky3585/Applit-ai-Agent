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

## Workspace Events (Task v1-8)

### Real-time Deletion Events - V1 Scope

**Current Implementation (V1)**:
- ✅ **Critical use case**: User viewing workspace in IDE → workspace deleted → real-time event + toast + redirect
- ✅ WebSocket subscription active when viewing a specific workspace
- ✅ Secure per-user event broadcasting (validates ownership before join)
- ✅ Prevents stale data when actively working in a deleted workspace

**V1 Limitation**:
- Dashboard users rely on aggressive refetching instead of real-time events
- If workspace deleted in another tab while on dashboard → updates within 30s or on window focus
- **Mitigation**: Dashboard configured with `refetchOnWindowFocus: true` and `staleTime: 30s`

**Why This is Acceptable for V1**:
1. Primary bug (stale IDE state) is fully fixed
2. Dashboard scenario less critical (not actively working)
3. Aggressive refetching provides acceptable UX
4. Full multi-route support would require complex "join all workspaces" logic

**Future Enhancement (V2)**:
- Subscribe to workspace events from any route (dashboard, settings, etc.)
- Join all owned workspaces on connection
- Real-time updates across all routes and tabs

---

Last Updated: November 14, 2025
