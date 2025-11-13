# AI Web IDE - Replit Core Clone

## Overview

This project is transforming from a simple AI Web IDE into a complete local Replit Core clone running on Ubuntu 24.04 with NVIDIA RTX 3060 GPU support. The system enables full prompt-to-app workflows where users type natural language requests and the system automatically plans, codes, tests, and deploys complete applications with live preview.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is built with React 18, TypeScript, Vite, and TanStack Query. It uses Shadcn/ui (based on Radix UI and Tailwind CSS) for its UI, following a "new-york" style with Inter and JetBrains Mono fonts. The layout is panel-based, featuring a TopBar, FileExplorer, CodeEditor, RightPanel (Chat, Logs, Agent State, Git, Templates), and TerminalPanel. Wouter handles lightweight routing, and WebSocket clients manage real-time communication for live updates.

### Backend

The backend utilizes Express.js with TypeScript. A dedicated WebSocket server (using `ws`) handles real-time features, organizing connections by workspace ID. An abstract storage layer (currently in-memory with `MemStorage`) is designed for future PostgreSQL integration via Drizzle ORM, managing users, workspaces, files, chat messages, and agent executions. RESTful APIs provide CRUD operations, while WebSockets manage real-time agent interactions.

### Data Storage

Drizzle ORM is configured for PostgreSQL, with a schema defining `users`, `workspaces`, `files`, `chatMessages`, and `agentExecutions`. While currently using in-memory storage for prototyping, production will use PostgreSQL 16 with `pgvector` for vector embeddings.

### AI Agent System

The system integrates with the OpenAI API for GPT-powered coding assistance. AI agents follow a workflow including `idle`, `planning`, `coding`, `testing`, and `fixing` states. Communication flows from user chat messages (via WebSocket) to the server, then to OpenAI, with streaming responses back to the client for real-time UI updates. Agent execution state is persisted per workspace for recovery and synchronization.

## Transformation Roadmap: Replit Core Clone

### Seven-Phase Implementation Plan

**Phase 1: Study & Architecture** ✅
- Analyzed original repository (https://github.com/vicky3585/ai-ide-agent)
- Designed hybrid Node.js + Python architecture
- Created module upgrade plan
- Gap analysis completed

**Phase 2: Core IDE Features** (Planned)
- Integrate code-server (real VS Code)
- Implement Docker sandbox for code execution
- Connect terminal to sandbox with streaming output
- Build live preview proxy server
- Migrate from in-memory to PostgreSQL storage

**Phase 3: AI Prompt-to-App Workflow** (Planned)
- Create Python LangGraph agent service
- Implement Planner agent (task decomposition)
- Implement Coder agent (file generation)
- Implement Tester agent (validation)
- Build auto-fix loop with 3-attempt retry

**Phase 4: Developer Tools** ✅ (All Tasks Complete)
- Task 4.1: Package Manager UI ✅
- Task 4.2: Project Templates ✅
- Task 4.3: GitHub OAuth & Git Integration ✅

**Phase 5: Multi-user & Security** (Planned)
- JWT authentication system
- Multi-project dashboard
- Sandbox lifecycle management
- Resource limits and security controls
- **Production-ready Git integration** with argv-based execution

**Phase 6: GPU & Offline Mode** (Planned)
- vLLM integration for RTX 3060
- LOCAL_FIRST routing (GPU → OpenAI fallback)
- Offline mode with cached responses
- Cost optimization with result reuse

**Phase 7: Deployment & Testing** (Planned)
- Docker Compose for all services
- Ubuntu 24.04 package (.deb installer)
- Comprehensive E2E tests
- Complete documentation

## Recent Development Progress

**Phase 4 Task 4.1 - Package Manager** (Completed 2025-11-13):
- Built PackageManagerPanel UI component with npm/pip/apt support
- Integrated InstallPackageDialog with autocomplete suggestions
- Added API routes for package installation and listing
- Extended ISandbox interface to support "apt" package manager
- Real-time package installation with progress indicators

**Phase 4 Task 4.2 - Project Templates** (Completed 2025-11-13):
- Created template system with 6 pre-built templates (React, Vue, Express, Flask, FastAPI, Next.js)
- Template configuration file (server/templates.ts) with complete file structures
- API routes: GET /api/templates, POST /api/workspaces/:id/apply-template
- TemplateSelectorModal with tabbed interface (All/Frontend/Backend/Fullstack)
- Integrated template selector into TopBar for easy access
- Template application clears existing workspace files before applying
- Toast notifications for user feedback on template application

**Phase 4 Task 4.3 - GitHub OAuth & Git Integration** (Completed 2025-11-13):

⚠️ **PROTOTYPE STATUS**: This implementation provides functional Git operations with validation-based security. However, it has known limitations:
- Current validation rejects some legitimate Git inputs (e.g., parentheses in commit messages like "feat(scope): add X")
- Uses shell-string interpolation which is not ideal for maximum security
- **Phase 5 Improvement Planned**: Complete rewrite using argv-based sandbox execution to eliminate shell parsing, allow all legitimate Git inputs, and provide production-grade security

**What's Working**:
- Git backend module (server/git.ts) with 10 operations: clone, status, stage, commit, push, pull, history, init, setRemote, log
- GitHub API integration (server/github.ts) via Octokit REST API with automatic token refresh
- 10 Git API routes fully exposed in server/routes.ts
- 3 GitHub API routes: user info, repository listing, repository details
- GitPanel UI component with:
  - Real-time Git status display (polling every 5 seconds)
  - File staging with checkbox selection
  - Commit workflow with message input
  - Push/pull operations with branch support
  - Commit history display (last 10 commits)
- GitHubBrowserModal for browsing user repositories with one-click cloning
- Integrated as "Git" tab in IDE right panel
- GitHub button in TopBar for easy repository access
- Input validation rejects high-risk shell metacharacters
- Defense-in-depth with validation + escaping + double-quoting
- URL format validation for clone/setRemote operations
- Numeric parameter safety (commit history limit clamping)

**Known Limitations (Phase 5)**:
- **Input Validation Too Strict**: Current validation rejects many legitimate characters to prevent command/argument injection:
  - Parentheses, braces, brackets (breaks "feat(scope):" style commits)
  - Dollar signs, quotes in commit messages
  - Quotes in filenames
  - This is an intentional security trade-off for Phase 4 prototype
- **Shell-String Execution**: Uses string interpolation instead of argv-based execution
- **Workspace Isolation**: Clone operation writes to current workspace directory without checking if empty
- **Phase 5 Solution**: Complete rewrite using argv-based sandbox execution (spawn/execFile) will:
  - Eliminate shell parsing and injection risks entirely
  - Allow all legitimate Git inputs (parentheses, quotes, special chars)
  - Provide production-grade security without functionality trade-offs

## External Dependencies

**AI Services**: OpenAI API (requires `OPENAI_API_KEY`)
**Database**: PostgreSQL (via Neon serverless driver, requires `DATABASE_URL`)
**UI Libraries**: Radix UI, Tailwind CSS, Lucide React
**Build & Runtime**: Vite, esbuild, tsx, Drizzle Kit
**Session Management**: connect-pg-simple
**New Services (Planned)**: Python Agent Service (LangGraph), vLLM Service (local GPU inference), code-server, Redis
