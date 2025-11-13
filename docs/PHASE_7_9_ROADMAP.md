# Phase 7-9 Roadmap: Achieving Replit Parity

## 🎯 Mission
Transform our AI Web IDE into a **Replit-class collaborative development platform** with real-time multiplayer, AI autocomplete, and self-testing capabilities.

---

## 📊 Current State vs. Target State

### ✅ **What We Have (Phase 6 Complete)**
- AI Multi-Agent System (Planner→Coder→Tester)
- Docker sandbox execution
- File persistence + hot reload
- Preview pane with live updates
- Package management (npm/pip/apt)
- Git/GitHub integration
- JWT authentication
- Command palette with fuzzy search
- Keyboard shortcuts (cross-platform)
- Retry logic & execution timeouts

### 🎯 **What We Need (Replit Parity)**
- 🔴 **Real-time multiplayer collaboration** (4 users, colored cursors, OT)
- 🔴 **AI Ghostwriter autocomplete** (context-aware suggestions)
- 🔴 **Self-testing AI** (browser automation + auto-fix)
- 🟡 **Multi-file tabs** (professional UX)
- 🟡 **File search** (Ctrl+P fuzzy finder)
- 🟡 **Code formatting** (Prettier/ESLint)
- 🟡 **Extended AI sessions** (200min vs. 2min)

---

## 🚀 Phase 7: Multiplayer Foundation (3-4 Weeks)

### **Objective**
Enable Google Docs-style real-time collaborative coding for 2-4 users simultaneously.

### **Week 1-2: Operational Transformation Integration**
**Core Technology: Yjs + Y-Monaco**

#### Tasks:
1. **Install Yjs ecosystem** (3 hours)
   ```bash
   npm install yjs y-monaco y-websocket
   ```

2. **Replace Monaco binding** (1 day)
   - Remove direct Monaco state management
   - Bind Monaco editor to Yjs Y.Text document
   - Handle cursor positions via Y.Awareness

3. **WebSocket Y-Provider** (2 days)
   - Create Yjs WebSocket provider
   - Sync CRDT updates across clients
   - Handle connection/reconnection logic

4. **Persistence layer** (1 day)
   - Store Yjs document state in PostgreSQL
   - Serialize/deserialize Y.Doc updates
   - Implement snapshot mechanism

**Output:** Conflict-free concurrent editing works locally

---

### **Week 2-3: User Presence System**
**Visual Indicators for Collaboration**

#### Tasks:
1. **Cursor positions** (2 days)
   - Broadcast cursor/selection changes via Y.Awareness
   - Render colored cursor overlays for each user
   - Show user name labels on cursors

2. **Filetree presence** (1 day)
   - Track which file each user is viewing
   - Display user avatars next to active files
   - Update presence on file navigation

3. **User list panel** (1 day)
   - Show all active collaborators
   - Display connection status (green/yellow/red)
   - Invite/remove collaborators UI

4. **Activity notifications** (1 day)
   - "User X joined the workspace"
   - "User Y is editing file.ts"
   - Non-intrusive toast notifications

**Output:** See who's coding where in real-time

---

### **Week 3-4: Multiplayer UI & Controls**
**Professional Collaboration Experience**

#### Tasks:
1. **Follow mode** (2 days)
   - Click user avatar to follow their view
   - Auto-scroll to their cursor position
   - Sync file navigation
   - Exit follow mode on user action

2. **Built-in chat** (2 days)
   - Real-time chat panel in IDE
   - Message history persistence
   - @mentions support
   - Chat notifications

3. **Permissions system** (2 days)
   - Owner/Editor/Viewer roles
   - Read-only mode for viewers
   - Invite links with role assignment
   - Revoke access controls

4. **Conflict resolution UI** (1 day)
   - Visual indicators for simultaneous edits
   - OT handles merging automatically
   - Show who last edited each line

**Output:** Full multiplayer IDE like Replit

---

## 🤖 Phase 8: AI Enhancement (2-3 Weeks)

### **Objective**
Add Ghostwriter-class autocomplete and autonomous testing capabilities.

### **Week 1: AI Ghostwriter Autocomplete**
**Real-Time Code Suggestions**

#### Tasks:
1. **Context extraction** (2 days)
   - Extract surrounding code (100 lines before/after cursor)
   - Include imports and file structure
   - Send to OpenAI/Claude with prompt template

2. **Monaco InlineCompletionsProvider** (2 days)
   - Implement Monaco's completion API
   - Trigger on keystroke (debounced 300ms)
   - Stream completions character-by-character
   - Accept with Tab key

3. **Multi-language support** (1 day)
   - Language-specific prompts
   - Context-aware for JS/TS/Python/Go/etc.
   - Framework detection (React, Express, Flask)

4. **Caching & optimization** (1 day)
   - Cache common completions
   - Prefetch on file open
   - Cancel in-flight requests on keystroke

**Output:** Copilot-class autocomplete

---

### **Week 2: Self-Testing AI**
**Autonomous Browser Automation**

#### Tasks:
1. **Playwright integration** (2 days)
   - Install Playwright + browsers
   - Create browser automation service
   - Launch headless Chrome for testing

2. **Test plan generation** (2 days)
   - AI generates test scenarios from code
   - Identify user flows (signup, login, CRUD)
   - Create Playwright scripts automatically

3. **Execution & bug detection** (2 days)
   - Run tests in preview iframe URL
   - Capture screenshots on failure
   - Compare expected vs. actual behavior
   - Parse console errors

4. **Auto-fix loop** (1 day)
   - Feed test failures to Coder agent
   - Re-run tests after fixes
   - Iterate until tests pass
   - Report results to user

**Output:** Autonomous testing + debugging

---

### **Week 3: Extended AI Sessions**
**Long-Running Workflows**

#### Tasks:
1. **Checkpoint system** (2 days)
   - Save state after each agent phase
   - Store in database with timestamp
   - Enable rollback to any checkpoint

2. **Total workflow timeout** (1 day)
   - Add AGENT_TOTAL_TIMEOUT (30 min default)
   - Wrap entire workflow in timeout
   - Graceful cancellation on timeout

3. **Resume from checkpoint** (2 days)
   - Detect incomplete workflows on load
   - Offer to resume from last checkpoint
   - Continue from saved state

4. **Progress UI** (1 day)
   - Show time elapsed / remaining
   - Checkpoint history timeline
   - Pause/resume controls

**Output:** 30min+ autonomous sessions

---

## 🎨 Phase 9: Professional UX (2 Weeks)

### **Objective**
Match modern IDE ergonomics (VS Code, Cursor, etc.)

### **Week 1: Core IDE Features**

#### Tasks:
1. **Multi-file tabs** (2 days)
   - Tab bar component with close buttons
   - Unsaved changes indicators (dots)
   - Keyboard shortcuts (Ctrl+W, Ctrl+Tab)
   - Tab context menu (close others, close all)

2. **File search** (1 day)
   - Reuse fuzzy search from command palette
   - Ctrl+P to open file finder modal
   - Navigate with arrow keys + Enter
   - Recently opened files at top

3. **Code formatting** (2 days)
   - Prettier for JS/TS/CSS/JSON
   - Black for Python, gofmt for Go
   - Format on save toggle
   - Ctrl+Shift+F manual format

**Output:** Professional editor experience

---

### **Week 2: Advanced Features**

#### Tasks:
1. **Integrated debugger** (3 days)
   - Breakpoints in Monaco gutter
   - Step through code execution
   - Variable inspection panel
   - Call stack visualization

2. **Workspace export/import** (2 days)
   - Export workspace as ZIP
   - Import existing projects
   - Preserve file structure
   - Include dependencies

3. **Better loading states** (1 day)
   - Skeleton screens for async ops
   - Progress bars for long operations
   - Spinner overlays with cancel buttons

**Output:** Feature-complete modern IDE

---

## 📈 Success Metrics

### **Phase 7 (Multiplayer)**
- ✅ 2-4 users can edit simultaneously without conflicts
- ✅ Cursor positions visible in real-time (<100ms latency)
- ✅ Filetree shows active collaborators
- ✅ Follow mode works smoothly
- ✅ Chat messages deliver instantly

### **Phase 8 (AI Enhancement)**
- ✅ Autocomplete suggestions appear in <500ms
- ✅ 70%+ acceptance rate on completions
- ✅ Self-tests identify 90%+ of UI bugs
- ✅ AI sessions run for 30+ minutes uninterrupted
- ✅ Checkpoint rollback works reliably

### **Phase 9 (UX)**
- ✅ Can open 10+ files in tabs smoothly
- ✅ File search finds files in <50ms
- ✅ Code formatting completes in <1s
- ✅ Debugger breakpoints work consistently
- ✅ Workspace export/import preserves all data

---

## 🛠 Technical Architecture Changes

### **New Dependencies**
```json
{
  "yjs": "^13.6.0",
  "y-monaco": "^0.1.0",
  "y-websocket": "^1.5.0",
  "playwright": "^1.40.0",
  "prettier": "^3.1.0",
  "@typescript-eslint/eslint-plugin": "^6.0.0"
}
```

### **Database Schema Updates**
```typescript
// Add to shared/schema.ts
export const collaborators = pgTable("collaborators", {
  id: serial("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull(),
  userId: integer("user_id").references(() => users.id),
  role: varchar("role").notNull(), // owner|editor|viewer
  joinedAt: timestamp("joined_at").defaultNow()
});

export const yjsDocuments = pgTable("yjs_documents", {
  id: serial("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull(),
  docName: varchar("doc_name").notNull(), // file path
  state: bytea("state").notNull(), // Y.Doc serialized state
  updatedAt: timestamp("updated_at").defaultNow()
});

export const checkpoints = pgTable("checkpoints", {
  id: serial("id").primaryKey(),
  workspaceId: varchar("workspace_id").notNull(),
  phase: varchar("phase").notNull(), // planning|coding|testing
  state: jsonb("state").notNull(), // workflow state
  createdAt: timestamp("created_at").defaultNow()
});
```

### **WebSocket Protocol Extensions**
```typescript
// Add to server/websocket.ts
type WSMessage = 
  // Existing
  | { type: 'agentState', data: AgentState }
  | { type: 'fileChange', data: FileChangeEvent }
  // New for multiplayer
  | { type: 'yjsUpdate', data: Uint8Array }
  | { type: 'cursorPosition', data: { userId: string, position: Position } }
  | { type: 'userJoined', data: { userId: string, username: string } }
  | { type: 'userLeft', data: { userId: string } }
  | { type: 'chatMessage', data: { userId: string, message: string } }
  // New for AI
  | { type: 'ghostwriterSuggestion', data: { completion: string } }
  | { type: 'testResult', data: TestResult }
  | { type: 'checkpoint', data: Checkpoint };
```

---

## 🎯 Implementation Priority

### **Must-Have (Do First)**
1. **Multiplayer OT** (Week 1-2) - Core differentiator
2. **Ghostwriter autocomplete** (Week 5) - User expectation
3. **Multi-file tabs** (Week 7) - Basic UX requirement

### **Should-Have (Do Next)**
4. **Self-testing AI** (Week 6) - Unique capability
5. **File search** (Week 7) - Productivity boost
6. **Code formatting** (Week 7) - Quality of life

### **Nice-to-Have (Can Defer)**
7. **Integrated debugger** (Week 8) - Advanced feature
8. **Workspace export** (Week 8) - Edge case
9. **Extended sessions** (Week 6) - Optimization

---

## 🚦 Go/No-Go Decision Points

### **After Week 2 (Multiplayer Foundation)**
**Question:** Is OT working reliably with 2+ users?
- ✅ YES → Continue to presence system
- ❌ NO → Debug Yjs integration, may need 1 extra week

### **After Week 5 (Ghostwriter)**
**Question:** Are completions useful and fast?
- ✅ YES → Move to self-testing
- ❌ NO → Improve prompts/caching, reassess model choice

### **After Week 7 (UX)**
**Question:** Does IDE feel professional?
- ✅ YES → Ship Phase 7-9, start Phase 10 (deployment)
- ❌ NO → Polish rough edges, add missing shortcuts

---

## 💰 Cost Estimate

### **Development Time**
- Phase 7: 3-4 weeks (120-160 hours)
- Phase 8: 2-3 weeks (80-120 hours)
- Phase 9: 2 weeks (80 hours)
**Total: 7-9 weeks (280-360 hours)**

### **API Costs (Monthly)**
- Ghostwriter completions: ~$50-100/month (1000 requests/day)
- Self-testing: ~$20/month (AI-generated test plans)
- Agent sessions: ~$100/month (existing)
**Total: ~$170-220/month**

### **Infrastructure**
- No additional cloud costs (runs locally)
- Optional: Redis for Yjs persistence (~$10/month)

---

## 🎓 Learning Resources

### **Multiplayer/OT**
- [Yjs Documentation](https://docs.yjs.dev/)
- [Y-Monaco Integration Guide](https://github.com/yjs/y-monaco)
- [Replit Multiplayer Blog](https://blog.replit.com/collab)

### **AI Autocomplete**
- [OpenAI Codex Documentation](https://platform.openai.com/docs/guides/code)
- [Monaco InlineCompletionsProvider](https://microsoft.github.io/monaco-editor/api/interfaces/monaco.languages.InlineCompletionsProvider.html)
- [Cursor Implementation Notes](https://cursor.sh/)

### **Browser Automation**
- [Playwright Documentation](https://playwright.dev/)
- [Puppeteer Guides](https://pptr.dev/)
- [Test Automation Patterns](https://martinfowler.com/articles/practical-test-pyramid.html)

---

## ✅ Definition of Done

**Phase 7-9 Complete When:**
- [ ] 4 users can code together in real-time
- [ ] AI autocomplete works across all languages
- [ ] Self-testing identifies and fixes bugs
- [ ] Multi-file tabs handle 20+ files smoothly
- [ ] File search finds files instantly
- [ ] Code formatting works on save
- [ ] All features have test coverage
- [ ] Documentation updated
- [ ] User guide created
- [ ] Demo video recorded

**Ship Criteria:**
- All P0 bugs fixed
- Performance benchmarks met
- Security review passed
- User testing with 3+ real users
- Comparison video vs. Replit recorded
