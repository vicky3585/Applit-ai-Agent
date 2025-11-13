# AI Web IDE - Replit Core Clone

## Overview
This project is an AI-powered Web IDE, functioning as a local Replit Core clone. Its main purpose is to enable full prompt-to-app workflows, allowing users to describe applications in natural language. The system then automates the planning, coding, testing, and deployment processes, providing a live preview with a split-screen code editor. It integrates robust development tools, AI agents for code generation and correction, file persistence, hot reload, and a scalable architecture for a comprehensive development environment.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Progress

**Phase 7 Multiplayer Foundation - Task 7.5 Complete (November 13, 2025):**
✅ **Yjs Persistence Layer** - E2E tested and verified working:
- Implemented three storage methods: `getYjsDocument`, `upsertYjsDocument`, `deleteYjsDocument`
- MemStorage with nested Maps for workspace → docName → YjsDocument
- Debounced auto-save (5s after last update) prevents excessive DB writes
- Save on disconnect (30s grace period) and shutdown
- Consistent key usage for load/save operations
- Error handling for async persistence with `.catch()` handlers
- **Critical fixes**: y-websocket URL construction using proper roomname pattern (`yjs/workspace/filename`) instead of query-only approach; server HTTP upgrade handler for `/yjs/*` paths instead of fixed `/yjs` path; path-based parameter extraction (workspace/docName from URL segments)
- **E2E test verified**: WebSocket connection, auto-save after 5s, and content persistence/restoration after page reload all working correctly

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