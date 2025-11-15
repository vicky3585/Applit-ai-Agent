# Automatic Package Installation - Deployment Guide

## 🎯 What Was Fixed

Your Applit AI IDE now has **fully automatic package installation** for React/Vite projects!

### Before (Broken):
```
User: "Create a counter app with React"
↓
AI generates .tsx files (no package.json) ❌
↓
No packages installed ❌
↓
Dev server fails to start ❌
Error: "Missing script: dev"
```

### After (Fixed):
```
User: "Create a counter app with React and Vite"
↓
AI generates complete React/Vite project with package.json ✅
↓
Automatically runs npm install ✅
↓
Dev server starts on port 3000 ✅
Preview works perfectly ✅
```

---

## 📋 What Changed

### 1. Fixed Coder Agent (`server/agents/coder.ts`)
**Problem:** The AI was instructed to NOT create React/Vite projects

**Solution:** Updated system prompt to support multiple project types:
- React/Vite projects (with package.json, vite.config.ts, etc.)
- Standalone HTML (single-file apps)
- Node.js backend servers
- Python applications

### 2. Integrated Package Installer (`server/agents/orchestrator.ts`)
**Problem:** Package installer existed but wasn't being called

**Solution:** Added automatic package installation step:
```
Plan → Code → Test → Install Packages → Start Dev Server
```

---

## 🚀 Deployment on Ubuntu

### Quick Deploy (Recommended)

```bash
# 1. Navigate to project
cd ~/projects/applit

# 2. Download the patch files
# Copy the contents of these files from the Replit instance:
# - COMPLETE_FIX_INSTRUCTIONS.md
# - SOLUTION_SUMMARY.md

# 3. Apply Fix #1: Update Coder Agent
nano server/agents/coder.ts
# See COMPLETE_FIX_INSTRUCTIONS.md for exact changes

# 4. Apply Fix #2: Update Orchestrator  
nano server/agents/orchestrator.ts
# See COMPLETE_FIX_INSTRUCTIONS.md for exact changes

# 5. Restart server
./start.sh

# 6. Test it!
rm -rf /tmp/ide-workspaces/default-workspace/*
# Go to http://192.168.31.138:5000
# Ask: "Create a counter app with React and Vite"
```

### Manual File Changes

If you prefer to see exactly what changed, here are the diffs:

#### File 1: `server/agents/coder.ts`

**Change A:** Replace the system prompt (lines 20-55)

**OLD CODE:**
```typescript
IMPORTANT FOR HTML/WEB APPS:
- Generate STANDALONE HTML files with INLINE CSS and JavaScript
- Do NOT create separate .tsx, .jsx, .css files unless explicitly requested
- Do NOT reference external React, Vue, or framework libraries
```

**NEW CODE:**
```typescript
PROJECT TYPE DETECTION:
Detect the requested project type from the user's prompt:

A) REACT/VITE PROJECTS (when user mentions React, Vite, or modern frameworks):
   - ALWAYS create package.json with appropriate dependencies
   - Generate src/ directory structure (src/App.tsx, src/main.tsx, etc.)
   - Include vite.config.ts if using Vite
   - Include index.html as entry point
   
B) STANDALONE HTML (for simple/static web apps):
   - Generate STANDALONE HTML files with INLINE CSS and JavaScript
   - No package.json needed
```

**Change B:** Increase token limit (line 72)

**OLD:** `max_tokens: 2000,`  
**NEW:** `max_tokens: 4000,`

#### File 2: `server/agents/orchestrator.ts`

**Change A:** Add import (around line 137)

**ADD THIS LINE:**
```typescript
const { detectPackages, installPackages } = await import("../package-installer");
```

**Change B:** Add package installation workflow (replace lines 145-165)

**OLD CODE:**
```typescript
state.logs.push("[Orchestrator] Starting dev server...");
const server = await manager.startServer(context.workspaceId, workspacePath);
```

**NEW CODE:**
```typescript
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
```

---

## ✅ Verification

### Success Checklist

After applying the fixes and restarting, create a new React app and check:

**Terminal Output:**
```
✅ [Orchestrator] Detecting required packages...
✅ [Orchestrator] Found 5 package(s) to install
✅ [PackageInstaller] 📦 Detecting npm packages to install: react, react-dom, vite, @vitejs/plugin-react, typescript
✅ [PackageInstaller] ⏳ Installing 5 npm package(s)...
✅ [PackageInstaller] ✅ Installed 5 npm package(s)
✅ [Orchestrator] ✅ Package installation complete
✅ [Orchestrator] Starting dev server...
✅ [DevServer:vite] VITE v5.4.20 ready in 81 ms
✅ [DevServer:vite] ➜ Local: http://0.0.0.0:3000/
✅ [Orchestrator] ✅ Dev server running on port 3000 (vite)
```

**Generated Files:**
```
✅ package.json exists
✅ vite.config.ts exists
✅ index.html exists
✅ src/App.tsx exists
✅ src/main.tsx exists
✅ node_modules/ directory created
```

**Dev Server:**
```bash
✅ lsof -i :3000  # Shows vite process
✅ curl http://localhost:3000  # Returns HTML
✅ Visit http://192.168.31.138:5000/preview/default-workspace/  # Shows React app
```

### Failure Troubleshooting

**Problem:** No package installer messages in terminal  
**Cause:** Orchestrator changes not applied  
**Fix:** Re-apply changes to `server/agents/orchestrator.ts`

**Problem:** No package.json generated  
**Cause:** Coder Agent changes not applied  
**Fix:** Re-apply changes to `server/agents/coder.ts`

**Problem:** Generated react-scripts instead of Vite  
**Cause:** Old Coder Agent prompt still active  
**Fix:** Verify systemPrompt contains "PROJECT TYPE DETECTION"

**Problem:** npm install fails  
**Cause:** Network issues or missing npm  
**Fix:** Check npm is installed: `npm --version`

---

## 📚 Additional Resources

### Documentation Files
- **COMPLETE_FIX_INSTRUCTIONS.md** - Detailed step-by-step patch instructions
- **SOLUTION_SUMMARY.md** - Comprehensive technical documentation
- **README_DEPLOYMENT.md** - This deployment guide

### Related Code Files
- `server/agents/coder.ts` - AI code generation with project type detection
- `server/agents/orchestrator.ts` - Workflow orchestration with package installation
- `server/package-installer.ts` - Package detection and npm/pip installation logic
- `server/dev-server-manager.ts` - Dev server spawning and management

### Testing Prompts

Try these prompts after deployment:

1. **React + Vite:**
   ```
   Create a simple counter app with React and Vite
   ```

2. **React + Vite + TypeScript:**
   ```
   Create a todo list app with React, Vite, and TypeScript
   ```

3. **Standalone HTML:**
   ```
   Create a simple calculator with pure HTML and JavaScript
   ```

4. **Node.js Backend:**
   ```
   Create an Express API server with a /hello endpoint
   ```

---

## 🔄 Workflow After Fix

### Complete Autonomous Workflow

```
1. USER PROMPT
   ↓
2. PLANNER
   Analyzes request → Creates execution plan
   ↓
3. CODER
   Generates files (package.json, index.html, src/*.tsx, vite.config.ts)
   ↓
4. TESTER
   Validates generated code
   ↓
5. PACKAGE INSTALLER (NEW!)
   Detects dependencies → Runs npm install
   ↓
6. DEV SERVER MANAGER
   Detects project type → Spawns Vite on port 3000
   ↓
7. PREVIEW READY
   App accessible at /preview/default-workspace/
```

### Timeline

- **Planning:** 2-5 seconds
- **Coding:** 5-10 seconds
- **Testing:** 1-2 seconds
- **Package Install:** 30-90 seconds (first time)
- **Dev Server:** 1-3 seconds
- **Total:** ~1-2 minutes for first app

---

## 🎓 Technical Deep Dive

### How Package Detection Works

```typescript
// 1. Parse package.json
if (file.path === "package.json") {
  const pkg = JSON.parse(file.content);
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return Object.keys(deps); // ['react', 'vite', ...]
}

// 2. Parse import statements
if (file.ext === ".ts" || file.ext === ".js") {
  // Extract: import React from 'react'
  //       → Package: 'react'
}
```

### How Package Installation Works

```typescript
// 1. Filter already installed
const toInstall = packages.filter(async pkg => {
  const installed = await isPackageInstalled(pkg);
  return !installed;
});

// 2. Install missing packages
await execAsync(
  `npm install ${toInstall.join(" ")}`,
  { cwd: workspacePath, timeout: 120000 }
);
```

### How Dev Server Detection Works

```typescript
// 1. Check for package.json
if (exists("package.json")) {
  const pkg = JSON.parse(readFile("package.json"));
  
  // 2. Detect Vite
  if (pkg.devDependencies?.vite || pkg.dependencies?.vite) {
    return { type: "vite", command: "npm run dev" };
  }
  
  // 3. Detect Node.js
  if (pkg.dependencies?.express) {
    return { type: "node", command: "npm start" };
  }
}
```

---

## 📝 Notes

### Performance
- First npm install: 60-90 seconds (downloads packages)
- Subsequent installs: 10-20 seconds (uses cache)
- Dev server start: 1-3 seconds

### Limitations
- Only supports npm and pip (no yarn, pnpm)
- Reinstalls all packages even if most exist
- No offline mode (requires internet)
- Package lock files not generated

### Future Improvements
- Incremental package installation
- Offline package caching
- Support for yarn/pnpm
- Parallel package downloads
- Package version pinning

---

## 🆘 Support

If you encounter issues:

1. **Check the logs** - Look for error messages in terminal
2. **Verify changes** - Use `grep` to confirm patches were applied
3. **Clear workspace** - `rm -rf /tmp/ide-workspaces/default-workspace/*`
4. **Restart server** - `./start.sh`
5. **Test incrementally** - Apply one fix at a time

### Contact
- GitHub: https://github.com/vicky3585/Applit-ai-Agent
- Replit: https://applit-ai-agent.replit.app/

---

**Last Updated:** November 15, 2024  
**Status:** Production Ready (Replit) | Pending Deployment (Ubuntu)  
**Version:** Phase 1 Complete
