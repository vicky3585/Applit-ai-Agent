# AI Web IDE - Replit Core Clone

## Overview
This project is an AI-powered Web IDE, functioning as a local Replit Core clone. Its main purpose is to enable full prompt-to-app workflows, allowing users to describe applications in natural language. The system then automates the planning, coding, testing, and deployment processes, providing a live preview with a split-screen code editor. It integrates robust development tools, AI agents for code generation and correction, file persistence, hot reload, and a scalable architecture for a comprehensive development environment.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Progress

**Phase 7 Multiplayer Foundation - Tasks 7.5-7.9 Complete (November 14, 2025):**

✅ **Task 7.5: Yjs Persistence Layer** - E2E tested and verified working:
- Implemented three storage methods: `getYjsDocument`, `upsertYjsDocument`, `deleteYjsDocument`
- MemStorage with nested Maps for workspace → docName → YjsDocument
- Debounced auto-save (5s after last update) prevents excessive DB writes
- Save on disconnect (30s grace period) and shutdown
- Consistent key usage for load/save operations
- Error handling for async persistence with `.catch()` handlers
- **Critical fixes**: y-websocket URL construction using proper roomname pattern (`yjs/workspace/filename`) instead of query-only approach; server HTTP upgrade handler for `/yjs/*` paths instead of fixed `/yjs` path; path-based parameter extraction (workspace/docName from URL segments)
- **E2E test verified**: WebSocket connection, auto-save after 5s, and content persistence/restoration after page reload all working correctly

✅ **Task 7.6: User Presence System** - Architect approved:
- MonacoBinding automatically handles cursor/selection tracking via Y.Awareness
- Awareness data structure: `{ user: { name, color, userId, activeFile }, cursor: { anchor, head } }`
- Added awareness change listeners for debugging
- No backend changes required (canonical y-websocket protocol handles everything)

✅ **Task 7.7: Colored Cursor Overlays** - Architect approved:
- Implemented per-user colored cursor and selection rendering in Monaco editor
- Fixed critical CSS class uniqueness bug (using `remote-cursor-${colorId}` instead of global classes)
- Normalized anchor/head to ensure valid Monaco ranges
- Deduplicated CSS injection via `injectedColorsRef` tracking
- Each collaborator retains distinct cursor/selection colors (8-color palette)
- Added hover tooltips showing username on cursors/selections
- Proper cleanup of decorations on tab change and unmount

✅ **Task 7.8: File Tree Presence Indicators** - Architect approved:
- Created `useFilePresence` hook for encapsulated state management
- FileExplorer displays colored dots next to active files (up to 3 users + overflow count)
- **Critical fixes**: Unique file ID keying (`tab.id` not `tab.name`) prevents duplicate filename collisions; useEffect dependency triggers correctly on file switches; background tab cleanup calls `onAwarenessUpdate` to prevent ghost indicators
- Real-time updates as users join/leave/switch files
- Supports multiple users per file with automatic deduplication
- Proper test IDs for all presence elements

✅ **Task 7.9: User List Panel (Workspace-Level Awareness)** - Architect approved, E2E tested:
- Created WorkspaceAwarenessProvider with dedicated Y.Doc for workspace-scoped presence tracking
- Separated workspace-level presence (user list) from per-file awareness (cursor tracking)
- Single awareness instance per workspace containing: `{ userId, name, color, activeFile, activeFileName, connected, lastUpdate }`
- Integrated into IDE component: setLocalPresence called on tab changes with both file ID and human-readable filename
- Connection status tracking via provider.on('status') listener
- UserListPanel consumes workspace users as single source of truth
- Proper cleanup: awareness cleared before provider destruction
- Architecture: Per-file Y.Docs for collaborative editing, workspace Y.Doc for presence only
- **Critical fixes**: Loading guard returns before WorkspaceAwarenessProvider instantiation (prevents empty identity props); AuthProvider stable fallback user with useRef (prevents ID regeneration); removed hardcoded currentUserIdRef/currentUsernameRef, using useAuth() as single source of truth; removed empty string fallbacks in CodeEditor/UserListPanel (user guaranteed non-null by loading guard)
- **Auth integration**: `/api/auth/me` endpoint with development fallback; AuthProvider → IDEWithAuth → WorkspaceAwarenessProvider hierarchy with explicit loading gates; all components use useAuth() for consistent identity
- **Provider lifecycle**: WorkspaceAwarenessProvider effect depends on [workspaceId, userId, username], reinitializes on identity changes; ensures awareness reconnects with correct identity after auth resolves
- **Type safety**: Created `useAuthenticatedUser()` hook that guarantees non-null user in protected components (IDEContent); eliminates need for non-null assertions while maintaining single source of truth
- **Human-readable filenames**: UserListPanel displays `activeFileName` (e.g., "App.tsx") instead of file IDs (UUIDs); IDEContent looks up filename from openTabs and includes it in presence payload
- **E2E verification**: Tested switching between package.json, App.tsx, and index.tsx; confirmed human-readable filenames display correctly with no UUID patterns visible

✅ **Task 7.10: Follow Mode** - Architect approved (November 14, 2025):
- Implemented complete follow mode feature enabling users to track another collaborator's view
- **State management**: `followingUserId` state tracks which user is being followed
- **Follow activation**: Click user card in UserListPanel to toggle follow mode; prevents self-following with error toast
- **Auto-follow logic**: useEffect watches followed user's `activeFile` and automatically switches to their current file
- **Exit mechanisms**: Three ways to exit follow mode:
  1. ESC key handler with global event listener
  2. X button in TopBar follow mode badge
  3. Manual file switch (automatically exits follow mode)
- **UI indicators**: 
  - TopBar displays blue badge showing "Following {username}" with inline X button
  - Followed user's card in UserListPanel highlighted with blue ring (`ring-2 ring-blue-500`)
  - Toast notifications for all state transitions (enter/exit follow mode)
- **Edge cases handled**: Gracefully exits follow mode if followed user disconnects; comprehensive user feedback via toast notifications
- **Wiring**: UserListPanel `onUserClick`, CodeEditor `onTabChange` uses `handleManualTabChange`, TopBar receives `followingUserName` and `onStopFollowing`
- **Architect review**: Confirmed all state transitions work correctly, auto-follow effect dependencies are correct, UI feedback is appropriate, code follows React best practices

## System Architecture

### UI/UX Decisions
The frontend, built with React 18, TypeScript, and Vite, uses Shadcn/ui (Radix UI + Tailwind CSS) following a "new-york" style. It features Inter and JetBrains Mono fonts and a panel-based layout including a TopBar, FileExplorer, CodeEditor, RightPanel (Chat, Logs, Agent State, Git, Templates), TerminalPanel, and PreviewPane with split-screen support.

### Technical Implementations
**Frontend:** Utilizes TanStack Query for data fetching, Wouter for routing, and WebSocket clients for real-time communication. Features a PreviewPane component with iframe integration and Monaco Editor with Y-Monaco bindings for collaborative editing.

**Authentication System:** JWT-based authentication with refresh token rotation. Access tokens (15min) and refresh tokens (7 days) are stored in httpOnly cookies. Session management includes atomic cap enforcement (MAX_SESSIONS_PER_USER=5) using row-level locking in PostgresStorage, progressive account lockout, and token reuse detection.

**Backend:** Powered by Express.js with TypeScript. A dedicated WebSocket server manages real-time features per workspace. An abstract storage layer (MemStorage for in-memory, PostgresStorage for PostgreSQL) implements the IStorage contract. RESTful APIs handle CRUD, and WebSockets manage real-time AI agent interactions and collaborative editing via a Yjs Provider.

**AI Multi-Agent System:**
- **Agents:** Planner, Coder, and Tester agents coordinate to analyze requests, generate code, and validate it.
- **Auto-Fix Loop:** Implements an intelligent retry mechanism with error feedback learning.
- **Orchestrator:** Coordinates the Planner→Coder→Tester→Fix workflow with real-time state broadcasting and enhanced error handling.
- **Real-Time Streaming:** Workflow logs stream to the chat panel.
- **File Management:** Generated files automatically appear in the File Explorer and are saved to disk.

**Core IDE Features:**
- **File Persistence System:** Dual-layer storage (in-memory + disk), security-hardened with path traversal prevention and workspace ID validation.
- **Hot Reload System:** File watching with chokidar and WebSocket-based change notifications for real-time preview refresh.
- **Dev Server Manager:** Auto-detection of app types (Node.js, Python, Vite, static HTML) and automatic server spawning with port management.
- **Code Execution System:** Production-ready Docker sandbox infrastructure for isolated multi-language code execution (JavaScript, Python, Go, Rust, C/C++, Java, Ruby, PHP, Shell) with real-time output streaming.
- **Developer Tools:** Package Manager UI (npm, pip, apt), Project Templates, GitHub & Git Integration (argv-based execution), Live Preview Pane, Settings Modal, Command Palette, and Keyboard Shortcuts.

### System Design Choices
The system is designed for a hybrid Node.js + Python architecture. Data storage uses dual backends: in-memory (MemStorage) for Replit environment and PostgreSQL 16 (PostgresStorage) for local Ubuntu, both implementing identical IStorage contract. Concurrency in MemStorage is handled by JavaScript's single-threaded event loop, while PostgresStorage uses row-level locking (SELECT FOR UPDATE) for atomic session operations. Authentication uses JWTs with refresh token rotation, bcrypt hashing for refresh tokens, and a progressive account lockout mechanism.

## External Dependencies

*   **AI Services**: OpenAI API
*   **Database**: PostgreSQL (via Neon serverless driver)
*   **UI Libraries**: Radix UI, Tailwind CSS, Lucide React
*   **Build & Runtime**: Vite, esbuild, tsx, Drizzle Kit
*   **Session Management**: connect-pg-simple