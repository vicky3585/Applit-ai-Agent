# Package Installer Integration - Manual Patch

## Summary
The automatic package installation feature exists in `server/package-installer.ts` but is **not integrated into the orchestrator workflow**. This patch adds the integration.

## Problem
The orchestrator generates code files but doesn't automatically install npm/pip packages before starting the dev server, causing errors like "Missing script: dev" or "Cannot find module 'vite'".

## Solution
Integrate `detectPackages()` and `installPackages()` into `server/agents/orchestrator.ts` between code generation and dev server spawning.

---

## File to Modify: `server/agents/orchestrator.ts`

### Find this section (around line 124-194):

```typescript
          if (testResult.passed) {
            state.logs.push("[Tester] All validation checks passed!");
            
            // AUTO-START DEV SERVER (Task 3: Auto-Start Dev Server After AI File Generation)
            const { ENV_CONFIG } = await import("@shared/environment");
            
            if (!ENV_CONFIG.sandbox.available) {
              state.logs.push("[Orchestrator] Dev server auto-start unavailable (requires Docker/local environment)");
              state.logs.push("[Orchestrator] Application ready - start dev server manually in Terminal");
            } else {
              try {
                const { getDevServerManager } = await import("../dev-server-manager");
                const { getFilePersistence } = await import("../file-persistence");
                
                const manager = getDevServerManager();
                const persistence = getFilePersistence();
                
                // Get workspace path using FilePersistence helper (ensures directory exists)
                const workspacePath = await persistence.resolveWorkspacePath(context.workspaceId);
                
                if (!workspacePath) {
                  state.logs.push("[Orchestrator] Failed to create workspace directory");
                } else {
                  // Try to start dev server (non-blocking, don't fail if it doesn't work)
                  state.logs.push("[Orchestrator] Starting dev server...");
                  const server = await manager.startServer(context.workspaceId, workspacePath);
                  
                  if (server) {
                    state.logs.push(`[Orchestrator] Dev server running on port ${server.port} (${server.type})`);
                  } else {
                    state.logs.push("[Orchestrator] No dev server configured (static files can still be previewed)");
                  }
                }
              } catch (error: any) {
                // Non-fatal error - just log it
                state.logs.push(`[Orchestrator] Could not start dev server: ${error.message}`);
              }
            }
```

### Replace with:

```typescript
          if (testResult.passed) {
            state.logs.push("[Tester] All validation checks passed!");
            
            // AUTO-INSTALL PACKAGES & START DEV SERVER
            const { ENV_CONFIG } = await import("@shared/environment");
            
            if (!ENV_CONFIG.sandbox.available) {
              state.logs.push("[Orchestrator] Dev server auto-start unavailable (requires Docker/local environment)");
              state.logs.push("[Orchestrator] Application ready - start dev server manually in Terminal");
            } else {
              try {
                const { getDevServerManager } = await import("../dev-server-manager");
                const { getFilePersistence } = await import("../file-persistence");
                const { detectPackages, installPackages } = await import("../package-installer");
                
                const manager = getDevServerManager();
                const persistence = getFilePersistence();
                
                // Get workspace path using FilePersistence helper (ensures directory exists)
                const workspacePath = await persistence.resolveWorkspacePath(context.workspaceId);
                
                if (!workspacePath) {
                  state.logs.push("[Orchestrator] Failed to create workspace directory");
                } else {
                  // Step 1: Auto-detect and install packages
                  state.logs.push("[Orchestrator] Detecting required packages...");
                  onStateUpdate({ ...state });
                  
                  const detectedPackages = detectPackages(state.filesGenerated);
                  
                  if (detectedPackages.length > 0) {
                    state.logs.push(`[Orchestrator] Found ${detectedPackages.length} package(s) to install`);
                    onStateUpdate({ ...state });
                    
                    const installResult = await installPackages(
                      detectedPackages,
                      workspacePath,
                      (message) => {
                        state.logs.push(`[PackageInstaller] ${message}`);
                        onStateUpdate({ ...state });
                      }
                    );
                    
                    if (installResult.success) {
                      state.logs.push("[Orchestrator] ✅ Package installation complete");
                    } else {
                      state.logs.push("[Orchestrator] ⚠️ Some packages failed to install, attempting to continue...");
                    }
                  } else {
                    state.logs.push("[Orchestrator] No packages to install");
                  }
                  
                  onStateUpdate({ ...state });
                  
                  // Step 2: Try to start dev server
                  state.logs.push("[Orchestrator] Starting dev server...");
                  onStateUpdate({ ...state });
                  
                  const server = await manager.startServer(context.workspaceId, workspacePath);
                  
                  if (server) {
                    state.logs.push(`[Orchestrator] ✅ Dev server running on port ${server.port} (${server.type})`);
                  } else {
                    state.logs.push("[Orchestrator] No dev server configured (static files can still be previewed)");
                  }
                }
              } catch (error: any) {
                // Non-fatal error - just log it
                state.logs.push(`[Orchestrator] Could not start dev server: ${error.message}`);
              }
            }
```

---

## How to Apply on Ubuntu

```bash
cd ~/projects/applit

# 1. Open the file in your editor
nano server/agents/orchestrator.ts
# or
vim server/agents/orchestrator.ts

# 2. Find the section around line 124-194 (search for "AUTO-START DEV SERVER")

# 3. Replace the entire section with the new code above

# 4. Save and exit

# 5. Restart the server
./start.sh
```

---

## Expected Behavior After Fix

When you ask the AI to create an app, you should see:

```
[Orchestrator] Detecting required packages...
[Orchestrator] Found 3 package(s) to install
[PackageInstaller] 📦 Detecting npm packages to install: react, react-dom, vite
[PackageInstaller] ⏳ Installing 3 npm package(s): react, react-dom, vite
[PackageInstaller] ✅ Installed 3 npm package(s)
[Orchestrator] ✅ Package installation complete
[Orchestrator] Starting dev server...
[DevServer:vite] VITE v5.4.20  ready in 81 ms
[Orchestrator] ✅ Dev server running on port 3000 (vite)
```

---

## Key Changes

1. **Added imports**: `detectPackages` and `installPackages` from `../package-installer`
2. **Step 1 - Package Detection**: Scans generated files for npm/pip imports
3. **Step 2 - Package Installation**: Installs missing packages with progress callbacks
4. **Step 3 - Dev Server Start**: Only starts after packages are installed
5. **Real-time Updates**: Calls `onStateUpdate()` after each step to broadcast progress

This ensures packages are installed **before** the dev server tries to start, preventing "module not found" errors.
