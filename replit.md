# AI Web IDE - Replit Core Clone

## Overview
This project is an AI-powered Web IDE that functions as a local Replit Core clone, designed to run on Ubuntu 24.04 with NVIDIA RTX 3060 GPU support. Its primary purpose is to enable full prompt-to-app workflows, allowing users to describe desired applications in natural language. The system then automatically plans, codes, tests, and deploys these applications, providing a live preview with split-screen code editor. The project integrates robust development tools, AI agents for code generation and correction, file persistence, hot reload, and a scalable architecture for a comprehensive development environment.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (November 13, 2025)
**Phase 4 Advanced Features Complete:**
- ✅ Preview Pane with iframe integration, custom URLs, open-in-new-tab
- ✅ Split-screen layout (code editor + preview side-by-side like Replit)
- ✅ File-to-disk persistence with security hardening (path traversal prevention, workspace ID validation)
- ✅ Hot reload system with WebSocket notifications for file changes
- ✅ Dev server manager for auto-detecting and running Node.js, Python, Vite, static servers
- ✅ Enhanced AI agent robustness (better error handling, validation, troubleshooting hints)
- ✅ Fixed shared state bug in orchestrator (per-workflow max attempts)
- ✅ Environment-aware configuration (works in both Replit and local Ubuntu)

## System Architecture

### UI/UX Decisions
The frontend, built with React 18, TypeScript, and Vite, uses Shadcn/ui (Radix UI + Tailwind CSS) following a "new-york" style. It features Inter and JetBrains Mono fonts and a panel-based layout including a TopBar, FileExplorer, CodeEditor, RightPanel (Chat, Logs, Agent State, Git, Templates), TerminalPanel, and **PreviewPane** with split-screen support.

### Technical Implementations
**Frontend:** Utilizes TanStack Query for data fetching and Wouter for lightweight routing. WebSocket clients ensure real-time communication. Features a **PreviewPane** component with iframe integration for live app previewing.

**Backend:** Powered by Express.js with TypeScript. A dedicated WebSocket server manages real-time features per workspace. An abstract storage layer, currently in-memory (`MemStorage`), is designed for future PostgreSQL integration via Drizzle ORM. RESTful APIs handle CRUD operations, while WebSockets manage real-time AI agent interactions.

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
- **Project Templates:** A system with 6 pre-built templates (React, Vue, Express, Flask, FastAPI, Next.js) and a selection modal
- **GitHub & Git Integration:** Implemented with argv-based execution for maximum security, eliminating shell injection risks. Supports 10 Git operations and GitHub API integration with a dedicated UI panel for status, staging, committing, pushing/pulling, and history
- **Live Preview Pane:** Iframe-based preview system with WebSocket hot reload integration, custom URL support (with proper input handling), open-in-new-tab functionality, split-screen layout support
- **Settings Modal:** Persistent workspace preferences including AI model selection, auto-fix configuration, and API key status display

### System Design Choices
The system is designed for a hybrid Node.js + Python architecture. Data storage will transition from in-memory to PostgreSQL 16 with `pgvector` for vector embeddings, managed by Drizzle ORM. The Docker sandbox provides container-per-workspace isolation with resource limits, activity tracking, and TTL-based cleanup. Security is a priority, with path traversal prevention, workspace ID validation, and argv-based Git execution. Future plans include multi-user support with JWT authentication, sandbox lifecycle management, dev server sandboxing (currently incomplete), and GPU integration with vLLM for local inference.

### Known Issues & Next Steps
**Security:**
- **File Persistence TOCTOU Race Condition**: A narrow race condition exists where a symlink could be swapped after validation but before file write in local development environments. This is LOW RISK because: (1) File persistence is disabled in Replit production environment, (2) Only enabled for trusted local Ubuntu development, (3) Comprehensive validation already prevents most attack vectors. Future enhancement: Implement O_NOFOLLOW-based protection for production use.
- Dev server manager needs sandboxing - currently spawns processes without ENV_CONFIG.ALLOW_PROCESS_SPAWN check (high-risk RCE vector for untrusted code)
- Need process isolation for user-generated code execution

**Features to Add:**
- Package installation progress UI
- WebContainer integration for browser-based Node.js execution
- One-click deployment system
- Streaming enhancements for agent workflow
- Retry backoff for API calls

**Security Hardening Complete:**
- ✅ Path traversal prevention (absolute/UNC/drive paths rejected)
- ✅ Workspace ID validation (regex-based)
- ✅ Symlink detection for existing paths (fs.realpath)
- ✅ Parent directory validation (component-by-component)
- ✅ Cross-workspace access prevention (WebSocket authentication)
- ✅ Broadcast isolation (workspace-scoped messages)
- ✅ Agent state isolation (no shared mutable state)

## External Dependencies

*   **AI Services**: OpenAI API (`OPENAI_API_KEY`)
*   **Database**: PostgreSQL (via Neon serverless driver, `DATABASE_URL`)
*   **UI Libraries**: Radix UI, Tailwind CSS, Lucide React
*   **Build & Runtime**: Vite, esbuild, tsx, Drizzle Kit
*   **Session Management**: connect-pg-simple
*   **Planned Services**: Python Agent Service (LangGraph), vLLM Service (local GPU inference), code-server, Redis