# Automatic Package Installation - Complete Solution

## Problem Identified

When users asked the AI to create React/Vite applications, the system would:
1. ❌ Generate `.tsx` files without `package.json`
2. ❌ Skip package installation step
3. ❌ Fail to start dev server (missing dependencies)
4. ❌ Show errors like "Missing script: dev" or "Cannot find module 'vite'"

## Root Cause Analysis

### Issue #1: Coder Agent Configuration
**File:** `server/agents/coder.ts`

The Coder Agent system prompt **explicitly prohibited React/Vite projects:**

```typescript
IMPORTANT FOR HTML/WEB APPS:
- Do NOT create separate .tsx, .jsx, .css files unless explicitly requested
- Do NOT reference external React, Vue, or framework libraries
```

This caused the AI to:
- Generate React components (`.tsx` files) because user requested "React"
- Skip `package.json` generation because instructions said "no frameworks"
- Create incomplete projects that couldn't run

### Issue #2: Missing Package Installation Integration
**File:** `server/agents/orchestrator.ts`

The orchestrator workflow was:
1. ✅ Plan → Coder → Tester
2. ❌ **Skipped package installation**
3. ✅ Start dev server

The `package-installer.ts` module existed but **wasn't integrated into the orchestrator workflow**.

## Solution Implemented

### Fix #1: Updated Coder Agent System Prompt

**Changes to `server/agents/coder.ts`:**

1. **Added PROJECT TYPE DETECTION** (lines 32-77):
   - Detects React/Vite, standalone HTML, Node.js, or Python projects
   - Provides specific instructions for each project type
   - Includes example `package.json` for React/Vite projects

2. **Key additions:**
   ```typescript
   A) REACT/VITE PROJECTS (when user mentions React, Vite, or modern frameworks):
      - ALWAYS create package.json with appropriate dependencies
      - Generate src/ directory structure (src/App.tsx, src/main.tsx, etc.)
      - Include vite.config.ts if using Vite
      - Include index.html as entry point
   ```

3. **Increased token limit** (line 114):
   - Changed from `max_tokens: 2000` to `max_tokens: 4000`
   - Allows AI to generate complete project structures

### Fix #2: Integrated Package Installation into Orchestrator

**Changes to `server/agents/orchestrator.ts`:**

1. **Added import** (line 137):
   ```typescript
   const { detectPackages, installPackages } = await import("../package-installer");
   ```

2. **Added package installation workflow** (lines 148-176):
   ```typescript
   // Step 1: Auto-detect and install packages
   state.logs.push("[Orchestrator] Detecting required packages...");
   const detectedPackages = detectPackages(state.filesGenerated);
   
   if (detectedPackages.length > 0) {
     const installResult = await installPackages(
       detectedPackages,
       workspacePath,
       (message) => {
         state.logs.push(`[PackageInstaller] ${message}`);
         onStateUpdate({ ...state });
       }
     );
   }
   
   // Step 2: Try to start dev server
   const server = await manager.startServer(context.workspaceId, workspacePath);
   ```

## How It Works Now

### Complete Workflow
1. **Planner** creates execution plan
2. **Coder** generates complete project:
   - `package.json` with dependencies
   - `index.html` entry point
   - `vite.config.ts` configuration
   - `src/` directory with React components
3. **Tester** validates generated code
4. **Package Installer** (NEW!):
   - Parses `package.json` for dependencies
   - Filters out already installed packages
   - Runs `npm install` with progress updates
5. **Dev Server Manager**:
   - Detects project type from `package.json`
   - Spawns Vite dev server on port 3000
   - Binds to `0.0.0.0` for network access

### Expected File Structure

When user asks: "Create a counter app with React and Vite"

Generated files:
```
/tmp/ide-workspaces/default-workspace/
├── package.json              ← Dependencies (react, vite, etc.)
├── index.html                ← Entry point
├── vite.config.ts           ← Vite configuration
└── src/
    ├── main.tsx             ← React root
    ├── App.tsx              ← Main component
    └── components/
        └── Counter.tsx      ← Counter component
```

### Terminal Output

```
[Planner] Analyzing request...
[Planner] Created execution plan
[Coder] Generating code files...
[Coder] Generated 5 files
[Tester] All validation checks passed!
[Orchestrator] Detecting required packages...
[Orchestrator] Found 5 package(s) to install
[PackageInstaller] 📦 Detecting npm packages to install: react, react-dom, vite, @vitejs/plugin-react, typescript
[PackageInstaller] ⏳ Installing 5 npm package(s): react, react-dom, vite, @vitejs/plugin-react, typescript
[PackageInstaller] ✅ Installed 5 npm package(s)
[Orchestrator] ✅ Package installation complete
[Orchestrator] Starting dev server...
[DevServer:vite] VITE v5.4.20 ready in 81 ms
[DevServer:vite] ➜ Local: http://0.0.0.0:3000/
[DevServer:vite] ➜ Network: http://192.168.31.138:3000/
[Orchestrator] ✅ Dev server running on port 3000 (vite)
```

## Deployment Instructions

### On Replit (Already Applied)
✅ Changes are already live on this Replit instance
✅ Test by asking: "Create a counter app with React and Vite"

### On Ubuntu/Local Machine

**Step 1: Download patch files**
```bash
cd ~/projects/applit

# Option A: Copy files from this Replit
# Download COMPLETE_FIX_INSTRUCTIONS.md

# Option B: Apply changes manually
```

**Step 2: Apply Fix #1 (Coder Agent)**
```bash
nano server/agents/coder.ts

# 1. Find the systemPrompt variable (line ~20)
# 2. Replace old prompt with new PROJECT TYPE DETECTION prompt
# 3. Find max_tokens: 2000 (line ~71)
# 4. Change to max_tokens: 4000
# 5. Save (Ctrl+O) and exit (Ctrl+X)
```

**Step 3: Apply Fix #2 (Orchestrator)**
```bash
nano server/agents/orchestrator.ts

# 1. Find the imports section (~line 135)
# 2. Add: const { detectPackages, installPackages } = await import("../package-installer");
# 3. Find the dev server start section (~line 145)
# 4. Replace with package installation + dev server workflow
# 5. Save (Ctrl+O) and exit (Ctrl+X)
```

**Step 4: Restart and test**
```bash
# Restart server
./start.sh

# Clear old workspace
rm -rf /tmp/ide-workspaces/default-workspace/*

# Open http://192.168.31.138:5000
# Ask: "Create a counter app with React and Vite"
```

## Verification

### Success Indicators
- ✅ See `[Orchestrator] Detecting required packages...` in terminal
- ✅ See `[PackageInstaller] 📦 Detecting npm packages...` in terminal
- ✅ See `npm install` running in terminal
- ✅ See `[DevServer:vite] VITE v... ready` in terminal
- ✅ Preview shows working React app at `/preview/default-workspace/`

### Failure Indicators
- ❌ No package installer messages → Orchestrator changes not applied
- ❌ No `package.json` generated → Coder changes not applied
- ❌ `Missing script: dev` error → Wrong package.json (react-scripts instead of vite)
- ❌ Dev server not starting → Packages not installed

## Technical Details

### Package Detection Algorithm
**File:** `server/package-installer.ts`

```typescript
function detectPackages(files: Array<{ path: string; content: string }>): DetectedPackage[] {
  for (const file of files) {
    if (file.path === "package.json") {
      // Parse package.json and extract dependencies
      const pkg = JSON.parse(file.content);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      return Object.keys(deps).map(name => ({ name, type: "npm", confidence: "high" }));
    }
    
    // Also parse imports from .js/.ts files
    if (ext === ".js" || ext === ".ts") {
      // Extract import statements
    }
  }
}
```

### Package Installation
**File:** `server/package-installer.ts`

```typescript
async function installPackages(
  packages: DetectedPackage[],
  workspaceDir: string,
  onProgress?: (message: string) => void
): Promise<PackageInstallResult> {
  // Filter already installed
  const toInstall = await filterAlreadyInstalled(packages);
  
  // Install npm packages
  if (npmPackages.length > 0) {
    await execAsync(`npm install ${npmPackages.join(" ")}`, {
      cwd: workspaceDir,
      timeout: 120000 // 2 min timeout
    });
  }
  
  // Install pip packages
  if (pipPackages.length > 0) {
    await execAsync(`pip install ${pipPackages.join(" ")}`, {
      cwd: workspaceDir,
      timeout: 120000
    });
  }
}
```

## Future Enhancements

### Planned Improvements
1. **Caching:** Skip re-installation if `package-lock.json` unchanged
2. **Progress UI:** Show package installation progress in frontend timeline
3. **Dependency Deduplication:** Share common packages across workspaces
4. **Version Pinning:** Lock versions to prevent breaking changes
5. **Offline Mode:** Cache downloaded packages for offline use

### Known Limitations
1. **First install is slow:** Full npm install can take 1-2 minutes
2. **No incremental installs:** Reinstalls all packages even if most exist
3. **No error recovery:** Failed package install stops the workflow
4. **Single package manager:** Only supports npm/pip (no yarn, pnpm)

## Related Files

### Modified Files
- `server/agents/coder.ts` - Updated system prompt + increased token limit
- `server/agents/orchestrator.ts` - Integrated package installation workflow

### Existing Infrastructure (Unchanged)
- `server/package-installer.ts` - Package detection and installation logic
- `server/dev-server-manager.ts` - Dev server spawning and management
- `server/file-persistence.ts` - Workspace file persistence
- `server/logger.ts` - Structured logging for package operations

### Documentation Files
- `COMPLETE_FIX_INSTRUCTIONS.md` - Detailed manual patch instructions
- `PACKAGE_INSTALLER_INTEGRATION.md` - Original orchestrator-only patch
- `SOLUTION_SUMMARY.md` - This comprehensive solution document

## Changelog

**2024-11-15 - Complete Package Installation Fix**
- ✅ Fixed Coder Agent to generate React/Vite projects with package.json
- ✅ Integrated automatic package installation into orchestrator workflow
- ✅ Increased token limit to support larger project generation
- ✅ Added comprehensive logging for package operations
- ✅ Tested on Replit environment (pending Ubuntu deployment)

## Support

### Troubleshooting

**Problem:** No package installer messages in logs
- **Cause:** Orchestrator changes not applied
- **Fix:** Apply Fix #2 from COMPLETE_FIX_INSTRUCTIONS.md

**Problem:** No package.json generated
- **Cause:** Coder Agent changes not applied
- **Fix:** Apply Fix #1 from COMPLETE_FIX_INSTRUCTIONS.md

**Problem:** Generated react-scripts instead of Vite
- **Cause:** Old Coder Agent prompt still in use
- **Fix:** Verify systemPrompt contains "PROJECT TYPE DETECTION"

**Problem:** npm install fails
- **Cause:** Network issues or invalid package names
- **Fix:** Check terminal output for npm error details

### Contact
For issues or questions about this fix, refer to:
- `COMPLETE_FIX_INSTRUCTIONS.md` for deployment steps
- GitHub repository: https://github.com/vicky3585/Applit-ai-Agent
- Replit instance: https://applit-ai-agent.replit.app/
