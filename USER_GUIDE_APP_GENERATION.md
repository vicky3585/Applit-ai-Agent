# User Guide: Generating Apps with Applit AI Agent

## Quick Start Guide

### Step 1: Open Applit IDE
1. Your Applit IDE should be running at `http://localhost:5000`
2. You'll see a split-screen layout with:
   - **Left**: File Explorer & Code Editor
   - **Right**: Chat Panel & Preview

### Step 2: Access the Chat Panel
1. Look at the **right sidebar**
2. Click on the **"Chat" tab** (should have a chat bubble icon)
3. You'll see a text input box at the bottom that says "Describe what you want to build..."

### Step 3: Send Your Prompt
Type your app idea in natural language. Here are example prompts:

#### **Simple Apps** (Great for testing)
```
Create a todo app with add, complete, and delete tasks
```

```
Build a simple calculator with basic operations
```

```
Make a countdown timer app
```

#### **Medium Complexity Apps**
```
Create a weather dashboard that shows current conditions
```

```
Build a note-taking app with categories and search
```

```
Make a recipe manager with ingredients list
```

#### **Advanced Apps**
```
Create a kanban board with drag-and-drop functionality
```

```
Build a music player with playlist management
```

```
Make a blogging platform with markdown support
```

### Step 4: Watch the AI Agent Work

Once you hit **Send**, you'll see:

#### **In the Chat Panel:**
1. Your prompt appears as a user message
2. Agent starts responding with updates
3. Progress messages appear in real-time

#### **In the Agent Workflow Card** (above chat):
You'll see the **Progress Timeline**:
```
[Planning...] → [Coding] → [Testing] → [Complete]
```

And **Activity Logs** (Phase 2 Feature!):
```
┌─ Filter Controls ─────────────────────────┐
│ [All Levels ▼] [All Phases ▼] [Search...] │
└──────────────────────────────────────────┘

📋 Planning (3 entries)
  🔵 INFO - Analyzing requirements
  ✅ SUCCESS - Plan created

💻 Coding (5 entries) 
  🔵 INFO - Generating files
  ✅ SUCCESS - Created index.html
  ✅ SUCCESS - Created app.js
  
📦 Package Installation (2 entries)
  ✅ SUCCESS - No packages needed
  
✨ Complete (1 entry)
  ✅ SUCCESS - App ready!
```

### Step 5: View Your Generated App

#### **Check Generated Files:**
1. Look at the **File Explorer** (left sidebar)
2. You'll see new files created:
   - `index.html`
   - `app.js` (or `script.js`)
   - `styles.css`
3. Click any file to see the generated code

#### **View Live Preview:**
1. Look at the **Preview Panel** (bottom-right or split view)
2. Your app should load automatically
3. If not, click the **"Open Preview"** or **"Refresh"** button

### Step 6: Interact with Features

#### **Use the Filters** (Phase 2 Feature!):
```
Show only errors:
[Error ▼] [All Phases ▼]

Show only package install logs:
[All Levels ▼] [Package Installation ▼]

Search for specific terms:
Type "npm" in search box
```

#### **Export Logs** (Phase 2 Feature!):
```
Click [📥 Export] button
Downloads: agent-logs-1234567890.json
```

---

## Troubleshooting

### "Nothing happens when I send a prompt"
✅ **Check**: Is the WebSocket connected?  
   - Look for "WebSocket connected" in browser console (F12)
   
✅ **Check**: Is OPENAI_API_KEY set?
   - Backend needs this environment variable

### "Agent fails immediately"
✅ **Check Activity Logs**:
   - Look for 🔴 ERROR entries
   - Expand to see error details
   - Check metadata for stack traces

### "Preview shows 'No app shown here'"
✅ **Possible causes**:
   1. App generation failed (check errors in logs)
   2. No HTML file generated yet
   3. Dev server not started
   
✅ **Solutions**:
   - Wait for workflow to complete
   - Check if `index.html` was created
   - Look for "Dev Server" phase in logs

### "Logs are simple text, not grouped"
This means structured logs aren't being emitted yet. Two possibilities:
1. **Using legacy agent** - Structured logs only work with updated TypeScript agent
2. **Fallback mode** - UI shows legacy logs when structured logs unavailable

---

## Tips for Best Results

### ✅ **Be Specific**
```
❌ "Make an app"
✅ "Create a todo app with add, edit, delete, and mark complete"
```

### ✅ **Mention Key Features**
```
✅ "Build a calculator with memory functions and history"
✅ "Make a timer with pause, reset, and custom durations"
```

### ✅ **Specify Tech If Needed**
```
✅ "Create a React todo app"
✅ "Build a vanilla JavaScript calculator"
```

### ✅ **Keep Initial Tests Simple**
Start with simple apps to verify the system works, then try complex ones.

---

## Expected Workflow Timeline

For a simple todo app:
- ⏱️ **Planning**: 3-5 seconds
- ⏱️ **Coding**: 10-15 seconds  
- ⏱️ **Testing**: 2-3 seconds
- ⏱️ **Package Install**: 5-10 seconds (if needed)
- ⏱️ **Dev Server**: 2-3 seconds
- ⏱️ **Total**: ~25-40 seconds

---

## What Success Looks Like

✅ Progress timeline shows all checkmarks  
✅ Generated files appear in File Explorer  
✅ Live Preview shows working app  
✅ Activity Logs show SUCCESS messages  
✅ No ERROR entries in logs  
✅ Status shows "✓ Generation complete! X files created"

---

## Need Help?

If something isn't working:
1. **Check Activity Logs** - Filter by "Error" level
2. **Export logs** - Download JSON for detailed debugging
3. **Check browser console** - Press F12 to see client errors
4. **Review workflow logs** - Check server-side logs for backend issues
