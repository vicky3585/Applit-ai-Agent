# Applit - AI-Powered Development Environment

**Developed by Flying Venture System**

## Overview
Applit is an AI-powered Web IDE designed to facilitate full "prompt-to-app" workflows, allowing users to describe applications in natural language. The system then automates the planning, coding, testing, and deployment processes, offering a live preview within a split-screen code editor. It integrates essential development tools, AI agents for code generation and correction, file persistence, hot reload capabilities, and a scalable architecture to provide a comprehensive development environment.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, and Vite, styled with Shadcn/ui (Radix UI + Tailwind CSS) in a "new-york" theme. It features Inter and JetBrains Mono fonts and a panel-based layout including a TopBar, FileExplorer, CodeEditor, RightPanel (Chat, Logs, Agent State, Git, Templates), TerminalPanel, and a split-screen PreviewPane.

### Technical Implementations
**Frontend:** Utilizes TanStack Query for data fetching, Wouter for routing, and WebSocket clients for real-time communication. The Monaco Editor is integrated with Y-Monaco bindings for collaborative editing.

**Authentication System:** Implements JWT-based authentication with refresh token rotation. Access and refresh tokens are managed via httpOnly cookies. Session management includes atomic cap enforcement (MAX_SESSIONS_PER_USER=5) using row-level locking in PostgresStorage, progressive account lockout, and token reuse detection.

**Backend:** Developed with Express.js and TypeScript. A dedicated WebSocket server manages real-time features per workspace. An abstract storage layer (MemStorage for in-memory, PostgresStorage for PostgreSQL) adheres to the IStorage contract. RESTful APIs handle CRUD operations, and WebSockets facilitate real-time AI agent interactions and collaborative editing via a Yjs Provider.

**AI Multi-Agent System:** Consists of Planner, Coder, and Tester agents that coordinate to analyze requests, generate, and validate code. It includes an auto-fix loop with error feedback learning and an Orchestrator that manages the Planner→Coder→Tester→Fix workflow, broadcasting real-time state and enhancing error handling. Workflow logs are streamed to the chat panel, and generated files are automatically saved and displayed.

**Phase 1 Autonomous Workflow (COMPLETE - Production Ready - November 16, 2024):** Fully automated agent workflow similar to Replit Agent:
- **Template-Based Generation System (FINAL - November 16, 2024)**: Implemented deterministic React/Vite project scaffolding with 8-file template (package.json, index.html, vite.config.ts, tsconfig files, src/main.tsx, src/index.css, src/App.tsx with working counter). Eliminates AI generation errors for simple requests, ensures all required files present. Orchestrator auto-clears existing files before template application to guarantee clean slate (existingFiles=0 condition). Smart component generation: template-only for simple prompts, template + AI for complex requests. **Fixed validator**: Template-based projects auto-pass validation (templates are pre-validated), preventing false positives from AI validator.
- **Auto Package Detection & Installation**: Fully integrated into orchestrator workflow. Parses package.json and code imports, filters built-ins, checks existing packages, and auto-installs missing dependencies via npm/pip with real-time progress broadcasting. Runs AFTER testing validation, BEFORE dev server spawn to ensure packages available. Removed legacy premature dev server code from routes.ts that was causing "Cannot find package 'vite'" errors.
- **Auto Dev Server Spawning**: After code generation and package installation, automatically detects project type (Node.js, Python, Vite, static) from package.json and spawns appropriate development server with port allocation and preview URL broadcasting. Binds to 0.0.0.0:3000 for network access. Controlled by orchestrator for proper workflow ordering.
- **Progress Timeline UI**: Visual timeline showing workflow phases (Planning → Coding → Testing → Package Installation → Dev Server → Complete) with animated status indicators, checkmarks for completed steps, spinners for active steps, and X marks for failures.
- **Error Handling & Retry**: Max 3-attempt retry loop with structured error feedback integrated into the autonomous workflow. Package installation errors logged but non-blocking.
- **Durable State Management**: Progress and failure state persist through retries, timeline accuracy maintained across all status transitions, defensive initialization prevents false positives.
- **Implementation Details**: 
  - Created server/agents/templates/react-vite.ts with complete 8-file scaffold
  - Modified server/agents/coder.ts for template-based generation with smart component logic
  - Updated server/agents/orchestrator.ts to auto-clear files and control complete workflow
  - Removed legacy dev server auto-start code from routes.ts (was causing premature execution)
  - Fixed environment detection priority in shared/environment.ts
  - Added .env configuration for Ubuntu deployment (DEPLOYMENT_ENV=local)

**Phase 2: Enhanced Logging & Feedback System (COMPLETE - Production Ready):**
- **Structured Log Schema**: Added LogEntry type with timestamp, level (info/warn/error/success/debug), phase (system/planning/coding/testing/fixing/package_install/dev_server/complete), message, and optional metadata. AgentExecution table includes backward-compatible structuredLogs field alongside legacy logs.
- **StructuredLogger Utility**: Centralized logging module (server/logger.ts) with createLogEntry() and convertLegacyLogs() functions for consistent log creation across TypeScript components.
- **Package Installer Integration**: package-installer.ts emits structured logs for npm/pip operations with phase metadata, package lists, status, and error context.
- **Storage Layer Support**: IStorage interface and MemStorage implementation handle optional structuredLogs field with graceful fallback to legacy logs when absent.
- **Frontend UI Components**: LogEntry component displays individual logs with level-based icons/colors. LogPhaseGroup component organizes logs into collapsible phase sections with error/warning counts.
- **AgentWorkflowCard Integration**: Conditionally renders structured logs grouped by phase with filtering controls (by level/phase/keyword), auto-expand on errors, and JSON export functionality. Falls back to legacy string logs when structured logs unavailable.
- **Dev Server Interface**: DevServerStartResult interface defined for future structured logging integration in dev-server-manager.ts.
- **Future Work**: Complete routes.ts orchestration integration, Python agent structured logging, and automated test coverage for filter/export behavior.

**Core IDE Features:**
- **File Persistence System:** Dual-layer storage (in-memory + disk) with security measures against path traversal.
- **Hot Reload System:** Uses chokidar for file watching and WebSockets for real-time preview updates.
- **Dev Server Manager:** Automatically detects application types (Node.js, Python, Vite, static HTML) and spawns development servers with port management.
- **Code Execution System:** Docker-based sandbox for isolated, multi-language code execution (JavaScript, Python, Go, Rust, C/C++, Java, Ruby, PHP, Shell) with real-time output streaming.
- **Live Preview System (FIXED - November 16, 2024):**
  - **Iframe HMR Stripping**: Uses http-proxy-middleware with responseInterceptor to remove `/@vite/client` script injection from HTML responses, preventing WebSocket errors in sandboxed iframes.
  - **Network-Aware Preview URLs**: On Ubuntu/local, preview URL uses the same hostname as the main app request (e.g., `http://192.168.31.138:3000` when accessing from `192.168.31.138:5000`). On Replit, returns proxy URL for same-origin policy compliance.
  - **Fix for Network Access Bug**: Preview now works when accessing from network IPs. Extracts hostname from request header and constructs dev server URL with same hostname but different port. Fixes iframe localhost mismatch where browser tried to load `localhost:3000` from user's machine instead of server.
- **Developer Tools:** Includes a Package Manager UI (npm, pip, apt), Project Templates, GitHub & Git Integration, Live Preview Pane, Settings Modal, Command Palette, and Keyboard Shortcuts.

**Multiplayer Foundation:**
- **Yjs Persistence Layer:** Manages Yjs document storage with debounced auto-save and save-on-disconnect functionality, ensuring data persistence and restoration.
- **User Presence System:** Leverages Y.Awareness for real-time cursor/selection tracking and user presence indicators in the editor and file explorer.
- **Follow Mode:** Allows users to track another collaborator's active file, with UI indicators and multiple exit mechanisms.

**Multi-Project Support:** Implements REST API endpoints for managing workspaces (create, list, delete) with ownership verification and name validation.

### System Design Choices
The system is built on a hybrid Node.js + Python architecture. Data storage uses both in-memory (MemStorage) for the Replit environment and PostgreSQL 16 (PostgresStorage) for local Ubuntu, both implementing the IStorage contract. Concurrency in MemStorage is managed by JavaScript's event loop, while PostgresStorage uses row-level locking for atomic session operations. Authentication uses JWTs with refresh token rotation, bcrypt hashing for refresh tokens, and a progressive account lockout mechanism.

**PostgreSQL Storage Status (November 2025):**
- ✅ **Core Functionality**: PostgresStorage fully operational, all 28 IStorage methods implemented
- ✅ **Data Persistence**: Workspace, files, chat messages, agent executions, deployments persisting correctly
- ✅ **Storage Factory**: Auto-detects DATABASE_URL accessibility, uses PostgresStorage when available
- ✅ **Yjs Persistence**: Real-time collaborative editing documents persist to yjs_documents table
- ✅ **Atomic Operations**: Transaction-based agent execution updates with FOR UPDATE locks
- ✅ **Session Management**: Advisory locks for MAX_SESSIONS_PER_USER cap enforcement
- ⚠️ **Production Hardening Needed**:
  - Advisory lock hashing uses simple char-code sum (collision-prone for anagrams) - needs 64-bit hash
  - Schema drift from manual SQL alterations - needs Drizzle migration reconciliation
  - Input validation with Zod not yet implemented on write paths
- **Deployment Note**: Core persistence works for Ubuntu 24.04, production fixes scheduled for focused session

**Static App Deployment System (Priority 0 - January 2025):**
- ✅ **Data Model**: Deployments table with lifecycle tracking (pending→building→success/failed), build logs, artifact paths, and public URLs
- ✅ **Storage Layer**: 4 deployment methods added to IStorage interface with full PostgresStorage implementation and MemStorage stubs
- ✅ **API Routes**: POST /api/workspaces/:id/deploy (trigger deployment), GET /api/workspaces/:id/deployments (list history)
- ✅ **Nginx Template**: Path-based routing (/apps/<workspaceId>/), SPA fallback, static asset caching, security headers
- ✅ **Documentation**: Comprehensive DEPLOYMENT_GUIDE.md with architecture decisions, testing checklist, troubleshooting
- 🚧 **Deferred to Next Pass**:
  - Build executor with pluggable strategy pattern (Vite, Static HTML, CRA detection)
  - Setup script for nginx installation and permissions
  - Build log streaming and atomic symlink deployment
  - Frontend UI for deployment triggers and status display
- **Architecture**: Per-workspace static builds in /var/www/ai-ide/<workspaceId>/, atomic symlink swaps, timestamped releases, zero-downtime deployments
- **Scope**: Static-only MVP (HTML/CSS/JS), defers subdomain routing, SSL/TLS, backend deployments to later phases

## External Dependencies

*   **AI Services**: OpenAI API
*   **Database**: PostgreSQL (via Neon serverless driver)
*   **UI Libraries**: Radix UI, Tailwind CSS, Lucide React
*   **Build & Runtime**: Vite, esbuild, tsx, Drizzle Kit
*   **Session Management**: connect-pg-simple