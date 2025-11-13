# AI Web IDE - Replit Core Clone

## Overview
This project is an AI-powered Web IDE that functions as a local Replit Core clone, designed to run on Ubuntu 24.04 with NVIDIA RTX 3060 GPU support. Its primary purpose is to enable full prompt-to-app workflows, allowing users to describe desired applications in natural language. The system then automatically plans, codes, tests, and deploys these applications, providing a live preview with split-screen code editor. The project integrates robust development tools, AI agents for code generation and correction, file persistence, hot reload, and a scalable architecture for a comprehensive development environment.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (November 13, 2025)
**Phase 7 Multiplayer Foundation (In Progress - Tasks 7.3-7.4 Complete):**
- ✅ **Yjs Backend Provider** (`server/yjs-provider.ts`): Canonical y-websocket protocol implementation with sync + awareness, document updates broadcast to ALL connected clients, client ID tracking for proper cleanup, 30-second grace period before document destruction
- ✅ **Monaco + Y-Monaco Integration** (`client/src/components/CodeEditor.tsx`): Replaced Textarea with Monaco editor bound to Yjs Y.Text, WebSocket connection to `/yjs` endpoint with query params, Y.Doc + provider caching (no recreation on tab switch), awareness cleared/restored on tab switching to prevent ghost cursors, full cleanup on tab close (destroy provider + Y.Doc)
- ✅ **Tab-Switching Presence Lifecycle**: Awareness state cleared when leaving tab, restored when entering tab, prevents presence leaks and ghost cursors (architect-approved after 4 iterations)
- **Next**: Tasks 7.5-7.14 pending (persistence, colored cursors, presence UI, follow mode, chat, permissions, e2e testing)

**Phase 6 Professional Enhancement Complete:**
- ✅ **Backend Resilience**: Exponential backoff retry logic for all OpenAI API calls (3 attempts, 2-30s backoff, smart error detection for rate limits/timeouts/network errors)
- ✅ **Execution Timeouts**: Per-phase timeout management (Planning: 60s, Code: 120s, Test: 60s) with timeout error handling and user hints
- ✅ **Keyboard Shortcuts System**: Cross-platform shortcuts (Ctrl on Windows/Linux, Cmd on macOS) with focus-aware gating, 8 shortcuts including Ctrl+K (command palette), Ctrl+1-4 (view switching), Ctrl+N (new file)
- ✅ **Command Palette**: VS Code-style command palette with custom fuzzy search (word boundaries, consecutive matches, gap penalties), 16 commands across 4 categories, keyboard navigation
- ✅ **Fuzzy Search Library**: Custom implementation (~60 lines, zero dependencies) with scoring algorithm for relevance ranking

**Phase 5.1 Authentication Foundation Complete:**
- ✅ Database schema enhanced: users table (email, password hashing, security fields), sessions table (refresh token rotation, FK constraints, indexes)
- ✅ Auth utilities: bcrypt password hashing, JWT signing/verification, progressive account lockout
- ✅ Authentication middleware: required + optional auth, Express.Request extension
- ✅ **Production-grade concurrency control**: Row-level locking (SELECT FOR UPDATE) in PostgresStorage for atomic session cap enforcement
- ✅ MemStorage + PostgresStorage parity: Both enforce MAX_SESSIONS_PER_USER=5, token reuse detection, userId verification
- ✅ Session management: create, rotate, delete with transactional safety

**Phase 4 Advanced Features:**
- ✅ Preview Pane with iframe integration, custom URLs, open-in-new-tab
- ✅ Split-screen layout (code editor + preview side-by-side like Replit)
- ✅ File-to-disk persistence with security hardening
- ✅ Hot reload system with WebSocket notifications
- ✅ Dev server manager for auto-detecting and running servers
- ✅ Enhanced AI agent robustness
- ✅ Package Installation UI with real-time progress tracking
- ✅ Code Execution System with deterministic mock output

## System Architecture

### UI/UX Decisions
The frontend, built with React 18, TypeScript, and Vite, uses Shadcn/ui (Radix UI + Tailwind CSS) following a "new-york" style. It features Inter and JetBrains Mono fonts and a panel-based layout including a TopBar, FileExplorer, CodeEditor, RightPanel (Chat, Logs, Agent State, Git, Templates), TerminalPanel, and **PreviewPane** with split-screen support.

### Technical Implementations
**Frontend:** Utilizes TanStack Query for data fetching and Wouter for lightweight routing. WebSocket clients ensure real-time communication. Features a **PreviewPane** component with iframe integration for live app previewing. **Monaco Editor** with Y-Monaco bindings for collaborative editing (Phase 7).

**Authentication System (Phase 5.1):** JWT-based authentication with refresh token rotation. Access tokens (15min) + refresh tokens (7 days) stored in httpOnly cookies. Session management with atomic cap enforcement (MAX_SESSIONS_PER_USER=5) using row-level locking in PostgresStorage. Progressive account lockout (3 fails=15min, 5 fails=1hr, 7+ fails=24hr). Both MemStorage (single-threaded) and PostgresStorage (row-level locks) enforce identical security contract.

**Backend:** Powered by Express.js with TypeScript. A dedicated WebSocket server manages real-time features per workspace. An abstract storage layer, currently in-memory (`MemStorage`), is designed for future PostgreSQL integration via Drizzle ORM. RESTful APIs handle CRUD operations, while WebSockets manage real-time AI agent interactions. **Yjs Provider** on `/yjs` endpoint for collaborative editing with canonical y-websocket protocol (Phase 7).

**AI Multi-Agent System (Phase 3-4 Complete):**
- **Planner Agent:** Analyzes user requests and creates detailed execution plans
- **Coder Agent:** Generates high-quality code based on plans, with JSON-structured output
- **Tester Agent:** Validates generated code using AI-powered checks for syntax, imports, and logic errors
- **Auto-Fix Loop:** Implements intelligent retry mechanism (configurable 3-20 attempts) with error feedback learning
- **Orchestrator:** Coordinates the complete Planner→Coder→Tester→Fix workflow with real-time state broadcasting, per-workflow state isolation (no shared mutable state), enhanced error handling with troubleshooting hints
- **Real-Time Streaming:** Workflow logs stream to chat panel, showing progress through each agent phase
- **File Management:** Generated files automatically appear in File Explorer via WebSocket events, saved to disk for preview
- **Settings Integration:** Configurable max iterations, model provider selection, and auto-fix toggles

**File Persistence System (Enhanced):**
- Dual-layer storage: in-memory for speed + optional disk persistence for preview
- Security-hardened with path traversal prevention, workspace ID validation (alphanumeric/hyphen/underscore only)
- Symlink-safe path normalization using path.resolve
- Environment-aware (enabled in local/development, uses ENV_CONFIG for proper root detection)
- Automatic workspace directory management with proper cleanup

**Hot Reload System:**
- File watching with chokidar, WebSocket-based change notifications
- Workspace-specific subscriptions (no cross-tenant leakage)
- Environment-aware enablement (development/local environments)
- Real-time preview refresh on file changes

**Dev Server Manager:**
- Auto-detection of app types (Node.js, Python, Vite, static HTML)
- Automatic server spawning with port management
- Process lifecycle tracking (though sandboxing incomplete - see Known Issues)
- Entry point detection (package.json scripts, main files)
**Core IDE Features:** Includes a production-ready Docker sandbox infrastructure for isolated code execution with concurrency control, supporting multi-language execution (11 languages including JavaScript, Python, Go, Rust, C/C++, Java, Ruby, PHP, Shell) via a polyglot Docker image. It features intelligent language detection, various execution modes (interpreter, compile-run, script), and build caching for compiled languages.
**Developer Tools:**
- **Package Manager:** UI component supporting npm, pip, and apt with real-time installation and progress indicators
- **Package Installation Tracker:** Real-time UI panel showing live package installation progress, streaming logs from npm/pip/apt commands, visual status indicators (Installing/Completed/Failed), installation history with duration tracking, and error messaging for debugging. Uses centralized WebSocket system for live updates.
- **Code Execution System:** Full-featured code execution with Docker sandbox (local) and enhanced mock sandbox (Replit). Features include: real-time output streaming via WebSocket, execution history tracking, multi-language support (11 languages), throttled output broadcasting (100ms intervals), status badges (Running/Success/Failed), exit code tracking, and deterministic mock output (parses console.log/print statements from file content). Production-ready with Docker; graceful fallback in Replit with simulated execution.
- **Project Templates:** A system with 6 pre-built templates (React, Vue, Express, Flask, FastAPI, Next.js) and a selection modal
- **GitHub & Git Integration:** Implemented with argv-based execution for maximum security, eliminating shell injection risks. Supports 10 Git operations and GitHub API integration with a dedicated UI panel for status, staging, committing, pushing/pulling, and history
- **Live Preview Pane:** Iframe-based preview system with WebSocket hot reload integration, custom URL support (with proper input handling), open-in-new-tab functionality, split-screen layout support
- **Settings Modal:** Persistent workspace preferences including AI model selection, auto-fix configuration, and API key status display
- **Command Palette & Shortcuts**: VS Code-style command palette (Ctrl/Cmd+K) with fuzzy search across 16 IDE commands, keyboard shortcuts with cross-platform support (Ctrl/Cmd), focus-aware gating to prevent conflicts with modals/dialogs

### System Design Choices
The system is designed for a hybrid Node.js + Python architecture. Data storage uses dual backends: in-memory (MemStorage) for Replit environment and PostgreSQL 16 (PostgresStorage) for local Ubuntu. Both backends implement identical IStorage contract with parity enforcement.

**Concurrency Strategy:**
- **MemStorage**: Single-threaded JavaScript event loop inherently serializes all operations. No explicit locking needed. Session mutations (create, rotate) are atomic due to synchronous map operations.
- **PostgresStorage**: Multi-threaded with concurrent transaction support. Uses row-level locking (SELECT FOR UPDATE) to serialize session operations per user. Both createSession and rotateSession lock the user row before counting sessions, preventing concurrent bypass of MAX_SESSIONS_PER_USER cap.

**Authentication Architecture:**
- JWT access tokens (15min) with userId + username claims
- JWT refresh tokens (7 days) with userId + sessionId claims  
- Refresh tokens hashed with bcrypt (10 rounds) before storage
- Session rotation uses atomic delete-and-insert within transaction
- Progressive lockout: 3 fails=15min, 5 fails=1hr, 7+ fails=24hr
- Session cap: 5 sessions per user (configurable via MAX_SESSIONS_PER_USER env var)

Future plans include PostgreSQL migration with `pgvector` for embeddings, sandbox lifecycle management, dev server sandboxing, and GPU integration with vLLM for local inference.

### Known Issues & Next Steps
**Security:**
- **File Persistence TOCTOU Race Condition**: A narrow race condition exists where a symlink could be swapped after validation but before file write in local development environments. This is LOW RISK because: (1) File persistence is disabled in Replit production environment, (2) Only enabled for trusted local Ubuntu development, (3) Comprehensive validation already prevents most attack vectors. Future enhancement: Implement O_NOFOLLOW-based protection for production use.
- Dev server manager needs sandboxing - currently spawns processes without ENV_CONFIG.ALLOW_PROCESS_SPAWN check (high-risk RCE vector for untrusted code)
- Need process isolation for user-generated code execution

**Features to Add:**
- WebContainer integration for browser-based Node.js execution
- One-click deployment system
- Streaming enhancements for agent workflow
- Overall workflow timeout wrapper (5min total cap)
- Cleanup on timeout (cancel orphaned operations)
- File search functionality
- Multi-file editing with tabs
- Code formatting support
- Workspace export/import
- In-app documentation panel

**Security Hardening Complete:**
- ✅ File System: Path traversal prevention, workspace ID validation, symlink detection, parent directory validation
- ✅ WebSocket: Cross-workspace access prevention, broadcast isolation, agent state isolation
- ✅ **Authentication (Phase 5.1):**
  - ✅ Refresh token hashing before storage (DB compromise protection)
  - ✅ Session cap enforcement with row-level locking (PostgreSQL SELECT FOR UPDATE)
  - ✅ Token reuse detection (throws on missing session during rotation)
  - ✅ Concurrent rotation protection (user row locking serializes operations)
  - ✅ Session hijacking prevention (userId verification in rotateSession)
  - ✅ Password strength validation (uppercase, lowercase, number, special char)
  - ✅ Progressive account lockout with configurable thresholds
  - ✅ FK cascade delete (auto-cleanup sessions on user deletion)

## External Dependencies

*   **AI Services**: OpenAI API (`OPENAI_API_KEY`)
*   **Database**: PostgreSQL (via Neon serverless driver, `DATABASE_URL`)
*   **UI Libraries**: Radix UI, Tailwind CSS, Lucide React
*   **Build & Runtime**: Vite, esbuild, tsx, Drizzle Kit
*   **Session Management**: connect-pg-simple
*   **Planned Services**: Python Agent Service (LangGraph), vLLM Service (local GPU inference), code-server, Redis