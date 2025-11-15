# Complete Fix for Automatic Package Installation

## Problem Summary
1. **Coder Agent** was instructed to NOT create React/Vite projects → generated `.tsx` files without `package.json`
2. **Orchestrator** wasn't calling the package installer before starting dev server
3. **Result**: No packages installed, dev server fails to start

## Two Files to Fix

---

## Fix #1: Update Coder Agent System Prompt

**File:** `server/agents/coder.ts`

### Find (around line 20-55):
```typescript
    const systemPrompt = `You are a coding agent that generates high-quality code based on execution plans.

Your task:
1. Follow the provided plan
2. Generate clean, working code
3. Include proper error handling
4. Add helpful comments
5. Follow best practices

IMPORTANT FOR HTML/WEB APPS:
- Generate STANDALONE HTML files with INLINE CSS and JavaScript
- Do NOT create separate .tsx, .jsx, .css files unless explicitly requested
- Do NOT reference external React, Vue, or framework libraries
- Use plain HTML, inline <style> tags, and inline <script> tags
- Make files SELF-CONTAINED and ready to run immediately in a browser

Output format:
Return a JSON object with this structure:
{
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "content": "file content here",
      "language": "html" // or javascript, python, etc.
    }
  ]
}

Rules:
- For web apps: Create .html files with everything inline
- Use relative paths (e.g., "calculator.html", "todo-app.html")
- Include all necessary code in a single file when possible
- Ensure code is syntactically correct and runs immediately
- Do not include explanations outside the JSON

${previousError ? `\n⚠️ Previous attempt failed with error:\n${previousError}\n\nPlease fix the issue and regenerate the code.` : ""}`;
```

### Replace with:
```typescript
    const systemPrompt = `You are a coding agent that generates high-quality code based on execution plans.

Your task:
1. Follow the provided plan
2. Generate clean, working code
3. Include proper error handling
4. Add helpful comments
5. Follow best practices

PROJECT TYPE DETECTION:
Detect the requested project type from the user's prompt:

A) REACT/VITE PROJECTS (when user mentions React, Vite, or modern frameworks):
   - ALWAYS create package.json with appropriate dependencies
   - Generate src/ directory structure (src/App.tsx, src/main.tsx, etc.)
   - Include vite.config.ts if using Vite
   - Include index.html as entry point
   - Use TypeScript (.tsx) for React components
   
   Example package.json for React + Vite:
   {
     "name": "app-name",
     "version": "1.0.0",
     "type": "module",
     "scripts": {
       "dev": "vite --port 3000 --host 0.0.0.0",
       "build": "tsc && vite build"
     },
     "dependencies": {
       "react": "^18.2.0",
       "react-dom": "^18.2.0"
     },
     "devDependencies": {
       "@types/react": "^18.2.0",
       "@types/react-dom": "^18.2.0",
       "@vitejs/plugin-react": "^4.0.0",
       "typescript": "^5.0.0",
       "vite": "^5.0.0"
     }
   }

B) STANDALONE HTML (for simple/static web apps):
   - Generate STANDALONE HTML files with INLINE CSS and JavaScript
   - Use plain HTML, inline <style> tags, and inline <script> tags
   - Make files SELF-CONTAINED and ready to run immediately in a browser
   - No package.json needed

C) NODE.JS BACKEND (when user wants a server/API):
   - Create package.json with express, etc.
   - Generate server files (server.js, routes/, etc.)
   
D) PYTHON (when user wants Python):
   - Generate .py files
   - Include requirements.txt if dependencies needed

Output format:
Return a JSON object with this structure:
{
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "content": "file content here",
      "language": "typescript" // or html, javascript, python, etc.
    }
  ]
}

CRITICAL RULES:
- For React/Vite projects: MUST include package.json, index.html, vite.config.ts, and src/ files
- For standalone HTML: Single .html file with everything inline
- Use relative paths (e.g., "package.json", "src/App.tsx", "index.html")
- Ensure code is syntactically correct and runs immediately
- Do not include explanations outside the JSON

${previousError ? `\n⚠️ Previous attempt failed with error:\n${previousError}\n\nPlease fix the issue and regenerate the code.` : ""}`;
```

### Also find (around line 71-73):
```typescript
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" },
```

### Replace with:
```typescript
        temperature: 0.3,
        max_tokens: 4000,
        response_format: { type: "json_object" },
```

---

## Fix #2: Integrate Package Installer into Orchestrator

**File:** `server/agents/orchestrator.ts`

### Find (around line 135-137):
```typescript
                const { getDevServerManager } = await import("../dev-server-manager");
                const { getFilePersistence } = await import("../file-persistence");
```

### Add this line right after:
```typescript
                const { detectPackages, installPackages } = await import("../package-installer");
```

### Find (around line 145-165):
```typescript
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
```

### Replace with:
```typescript
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
```

---

## How to Apply on Ubuntu

```bash
cd ~/projects/applit

# Method 1: Using nano (recommended for beginners)
nano server/agents/coder.ts
# Apply Fix #1 changes
# Ctrl+O to save, Ctrl+X to exit

nano server/agents/orchestrator.ts
# Apply Fix #2 changes
# Ctrl+O to save, Ctrl+X to exit

# Method 2: Using vim
vim server/agents/coder.ts
# Apply Fix #1 changes
# :wq to save and exit

vim server/agents/orchestrator.ts
# Apply Fix #2 changes
# :wq to save and exit

# After applying both fixes, restart the server
./start.sh
```

---

## Testing the Fix

```bash
# 1. Clear old workspace
rm -rf /tmp/ide-workspaces/default-workspace/*

# 2. Go to http://192.168.31.138:5000

# 3. Ask the AI:
"Create a simple counter app with React and Vite"

# 4. Watch your terminal for these messages:
[Orchestrator] Detecting required packages...
[Orchestrator] Found 5 package(s) to install
[PackageInstaller] 📦 Detecting npm packages to install: react, react-dom, vite, @vitejs/plugin-react, typescript
[PackageInstaller] ⏳ Installing 5 npm package(s)...
[PackageInstaller] ✅ Installed 5 npm package(s)
[Orchestrator] ✅ Package installation complete
[Orchestrator] Starting dev server...
[DevServer:vite] VITE v5.4.20 ready in 81 ms
[DevServer:vite] ➜ Local: http://0.0.0.0:3000/
[Orchestrator] ✅ Dev server running on port 3000 (vite)
```

---

## Expected File Structure After Fix

When you ask for "Create a counter app with React and Vite", the AI should now generate:

```
/tmp/ide-workspaces/default-workspace/
├── package.json          ← NEW! Will trigger package installation
├── index.html
├── vite.config.ts       ← NEW! Vite configuration
└── src/
    ├── main.tsx
    ├── App.tsx
    └── components/
        └── Counter.tsx
```

---

## What Changed?

**Before:**
1. ❌ AI generates only `.tsx` files (no package.json)
2. ❌ Package installer has nothing to work with
3. ❌ Dev server manager can't detect project type
4. ❌ Dev server fails to start

**After:**
1. ✅ AI generates complete React/Vite project with package.json
2. ✅ Package installer detects dependencies from package.json
3. ✅ Automatically runs `npm install`
4. ✅ Dev server starts successfully on port 3000
5. ✅ Preview works at http://192.168.31.138:5000/preview/default-workspace/
