# Troubleshooting: Live Preview Shows "No App Shown Here"

## Understanding the Issue

The preview pane shows different messages depending on the state:

### What You Should See:

#### **Before Generating an App:**
```
┌─────────────────────────────────────┐
│  🌐 No Preview Available            │
│                                     │
│  Click "Generate with AI" in the   │
│  Chat tab and ask for an app       │
│  (e.g., "Create a calculator app").│
│  Your generated HTML files will    │
│  appear here automatically!        │
│                                    │
│  Or enter a custom URL in the bar │
│  above to preview any webpage.    │
└─────────────────────────────────────┘
```

#### **After Generating an App:**
The preview should automatically load your generated HTML file in an iframe.

---

## Step-by-Step: How to Generate an App & See Preview

### Step 1: Verify Applit IDE is Running
1. Open your browser to `http://localhost:5000`
2. You should see the Applit IDE interface with:
   - Left panel: File Explorer
   - Center: Code Editor
   - Right panel: Chat, Logs, Git tabs

### Step 2: Navigate to the Chat Tab
1. Click the **"Chat"** tab in the right sidebar
2. You'll see a message input at the bottom
3. Above it, you should see an **"Agent Workflow Card"** (initially idle)

### Step 3: Generate a Simple App
Type this in the chat input and press Enter:

```
Create a simple todo app with add and delete tasks
```

### Step 4: Watch the Workflow Execute

You'll see the **Agent Workflow Card** update in real-time:

```
┌─ AI Agent Workflow ──────────────────┐
│ Status: Processing                   │
│                                      │
│ Progress Timeline:                   │
│ [✓] Planning → [⟳] Coding → [ ] Testing → [ ] Complete
│                                      │
│ Progress: 45% complete               │
│                                      │
│ ▼ Activity Logs (12)      [Export]  │
│   Filter: [All Levels▼] [All Phases▼] [Search...]
│                                      │
│   📋 Planning (3 entries)            │
│     ✅ Plan created                  │
│                                      │
│   💻 Coding (5 entries)              │
│     ✅ Created index.html            │
│     ✅ Created app.js                │
│     ✅ Created styles.css            │
│                                      │
│   📦 Package Installation (2 entries)│
│     ✅ No packages needed            │
│                                      │
└──────────────────────────────────────┘
```

### Step 5: Files Appear in Explorer

Check the **File Explorer** (left sidebar). You should see new files:
```
📁 default/
  ├── 📄 index.html
  ├── 📄 app.js
  └── 📄 styles.css
```

### Step 6: Preview Loads Automatically

The **Preview Pane** should automatically:
1. Detect the new `index.html` file
2. Load it in the iframe
3. Display your todo app

---

## Common Issues & Solutions

### Issue 1: "No Preview Available" (Expected Before Generation)

**What it means:** No HTML files have been generated yet.

**Solution:**
1. Use the Chat tab to generate an app
2. Wait for "✓ Generation complete!" message
3. Preview will auto-update when files are created

---

### Issue 2: Preview Shows Blank/White Page

**Possible causes:**
- HTML file exists but has errors
- JavaScript failed to load
- CSS not loading

**Debug steps:**

1. **Check Browser Console:**
   - Press `F12` to open DevTools
   - Look for errors in Console tab
   - Common errors:
     ```
     Failed to load resource: net::ERR_FILE_NOT_FOUND
     Uncaught SyntaxError: ...
     ```

2. **Check Generated Files:**
   - Click `index.html` in File Explorer
   - Verify it has content
   - Look for `<script>` and `<link>` tags

3. **Force Refresh:**
   - Click the 🔄 refresh button in preview header
   - Or click 🔗 to open in new tab

---

### Issue 3: Preview Not Updating After File Changes

**Causes:**
- Hot reload WebSocket disconnected
- Auto-reload disabled

**Solutions:**

1. **Manual Refresh:**
   - Click the 🔄 refresh button

2. **Check WebSocket:**
   - Open browser console (F12)
   - Look for: `[PreviewPane] File changed: ...`
   - If missing, WebSocket isn't connected

3. **Reconnect:**
   - Refresh the entire Applit IDE page
   - WebSocket should reconnect automatically

---

### Issue 4: Agent Workflow Fails

**Check Activity Logs:**

1. **Expand Logs Section:**
   - Click `▼ Activity Logs` in Agent Workflow Card

2. **Filter by Errors:**
   - Select `[Error ▼]` in level filter
   - Look for 🔴 ERROR entries

3. **Common Errors:**

   **Missing OpenAI API Key:**
   ```
   🔴 ERROR - OpenAI API key not configured
   ```
   **Solution:** Set `OPENAI_API_KEY` environment variable

   **Package Install Failed:**
   ```
   🔴 ERROR - npm install failed: ...
   ```
   **Solution:** Check npm logs, fix package.json

   **Code Generation Error:**
   ```
   🔴 ERROR - Failed to generate code
   ```
   **Solution:** Try simpler prompt, check API quota

---

### Issue 5: Dev Server Not Starting

**Symptoms:**
- Preview shows port error
- "Server not running" message

**Check Dev Server Logs:**

1. Filter Activity Logs:
   ```
   [All Levels ▼] [Dev Server ▼]
   ```

2. Look for:
   ```
   ✅ SUCCESS - Dev server started on http://localhost:3000
   ```

   Or:
   ```
   🔴 ERROR - Failed to start dev server: Port already in use
   ```

**Solutions:**

- **Port in use:** Kill process on port 3000
  ```bash
  lsof -ti:3000 | xargs kill -9
  ```

- **No server needed:** Static HTML apps don't need dev server

---

## Testing Checklist

Use this checklist to verify everything works:

### ✅ Pre-Generation
- [ ] Applit IDE loads at `http://localhost:5000`
- [ ] Chat tab is accessible
- [ ] Preview shows "No Preview Available" message
- [ ] File Explorer is empty (or shows default workspace)

### ✅ During Generation
- [ ] Agent Workflow Card appears when prompt is sent
- [ ] Progress Timeline shows current phase
- [ ] Activity Logs update in real-time
- [ ] Logs are grouped by phase (Planning, Coding, etc.)
- [ ] Can filter logs by level/phase
- [ ] Files appear in File Explorer as they're created

### ✅ Post-Generation
- [ ] Timeline shows all checkmarks: ✓✓✓✓
- [ ] Status: "✓ Generation complete! X files created"
- [ ] Preview loads automatically
- [ ] Generated app is functional
- [ ] Can export logs as JSON
- [ ] Hot reload works (edit file, preview updates)

---

## Advanced Debugging

### Enable Verbose Logging

**Browser Console:**
```javascript
localStorage.setItem('DEBUG', 'true');
location.reload();
```

**Server Logs:**
Check terminal where you ran `npm run dev`:
```bash
grep -i "preview\|agent\|workflow" logs.txt
```

### Inspect Network Requests

1. Open DevTools (F12)
2. Go to Network tab
3. Look for:
   - `/api/workspaces/:id/preview-url` - Should return 200
   - `/api/workspaces/:id/files` - Should list generated files
   - `/preview/:workspaceId/index.html` - Should load HTML

### Check WebSocket Connection

Browser console should show:
```
[WorkspaceEvents] WebSocket connected for workspace: default
WebSocket connected
```

If you see:
```
WebSocket error
WebSocket closed
Reconnecting... (attempt 1)
```

**Solution:** Check server is running, firewall allows WebSocket

---

## Quick Reference: Preview URL Format

The preview system uses these URL patterns:

### With Dev Server Running:
```
/preview/{workspaceId}/
→ Proxies to http://localhost:3000
```

### Static HTML (No Dev Server):
```
/preview/{workspaceId}/index.html
→ Serves file directly from workspace
```

### Custom URL:
```
Type any URL in the preview URL bar
→ Loads in iframe
```

---

## Still Not Working?

If you've tried everything above:

1. **Export Activity Logs:**
   - Click `[📥 Export]` button in Activity Logs
   - Download `agent-logs-XXXXX.json`

2. **Check for Errors:**
   - Look for all `"level": "error"` entries
   - Note which `"phase"` they occurred in

3. **Restart Services:**
   ```bash
   # Kill all node processes
   pkill -9 node
   
   # Restart Applit
   npm run dev
   ```

4. **Clear Browser Cache:**
   - Press Ctrl+Shift+Delete
   - Clear cached images and files
   - Reload page

5. **Try Minimal Test:**
   - Prompt: "Create a single HTML file that says Hello World"
   - Should generate quickly
   - Should preview immediately

---

## Success Indicators

You know everything is working when:

✅ **Chat → Agent generates files**  
✅ **Files appear in File Explorer**  
✅ **Preview loads automatically**  
✅ **Activity Logs show SUCCESS messages**  
✅ **Can filter/search/export logs**  
✅ **Hot reload updates preview on file changes**

If all these work, **Phase 2 Structured Logging is fully functional!** 🎉
