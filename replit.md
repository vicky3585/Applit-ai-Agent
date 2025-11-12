# AI Web IDE

## Overview

This is an AI-powered web-based Integrated Development Environment (IDE) that provides intelligent coding assistance through agent-based workflows. The application combines a traditional IDE interface with real-time AI agent collaboration, enabling developers to interact with AI assistants that can plan, code, test, and fix code automatically.

The system features a multi-panel layout with file management, code editing, chat interface, terminal access, and real-time agent state monitoring. It's designed to maximize information density while maintaining clarity, following IDE-specific design patterns inspired by VS Code and JetBrains IDEs.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**: React 18 with TypeScript, Vite for build tooling, and TanStack Query for state management.

**UI Framework**: Shadcn/ui component library built on Radix UI primitives with Tailwind CSS for styling. The design system uses the "new-york" style variant with custom typography (Inter for UI, JetBrains Mono for code) and a neutral color palette.

**Component Structure**: The IDE follows a panel-based layout system using resizable panels:
- TopBar: Displays workspace information and agent status controls
- FileExplorer: Left sidebar for file tree navigation (width: 16rem)
- CodeEditor: Central panel with tabbed file editing interface
- RightPanel: Contains Chat, Logs, and Agent State views (40/30/30% distribution)
- TerminalPanel: Bottom panel for command execution (height: 12rem)

**Routing**: Uses Wouter for lightweight client-side routing, though the current implementation is primarily single-page (IDE view).

**Real-time Communication**: WebSocket client implementation for bidirectional communication with the server, enabling live agent state updates and streaming chat responses.

### Backend Architecture

**Server Framework**: Express.js with TypeScript, running in ESM mode.

**WebSocket Server**: Dedicated WebSocket server using the 'ws' library, mounted at `/ws` path for real-time features. Connections are organized by workspace ID, allowing multiple clients to observe the same workspace state.

**Storage Layer**: Abstract storage interface (IStorage) with in-memory implementation (MemStorage). This abstraction allows future migration to PostgreSQL through Drizzle ORM without changing business logic. The storage manages:
- User accounts and authentication
- Workspaces (development environments)
- Files (code and content)
- Chat messages (user-agent conversations)
- Agent execution state (current workflow status)

**API Design**: RESTful endpoints for CRUD operations on workspaces, files, and chat messages. WebSocket handles real-time updates and agent communication.

### Data Storage

**ORM**: Drizzle ORM configured for PostgreSQL with schema definitions in `shared/schema.ts`.

**Schema Design**:
- `users`: Authentication and user management
- `workspaces`: Project containers owned by users
- `files`: Code files with path, content, and language metadata
- `chatMessages`: Conversation history with role-based messages and JSON metadata
- `agentExecutions`: Agent workflow state tracking with status progression

**Current Implementation**: In-memory storage using Map structures for rapid prototyping. Production deployment requires database provisioning and running migrations via `npm run db:push`.

### AI Agent System

**Provider**: OpenAI API integration for GPT-powered coding assistance.

**Agent Workflow States**: 
- idle: No active task
- planning: Analyzing requirements and creating implementation plan
- coding: Generating or modifying code
- testing: Running tests on generated code
- fixing: Applying corrections based on test results

**Communication Flow**: Users send chat messages through WebSocket → Server processes with OpenAI → Streaming responses sent back to client → UI updates in real-time.

**State Management**: Agent execution state persisted with workspace association, allowing session recovery and multi-client synchronization.

## External Dependencies

**AI Services**:
- OpenAI API: Primary AI model provider requiring `OPENAI_API_KEY` environment variable

**Database**:
- PostgreSQL: Production database via Neon serverless driver (`@neondatabase/serverless`)
- Required environment variable: `DATABASE_URL`

**UI Libraries**:
- Radix UI: Accessible component primitives (dialogs, dropdowns, tooltips, etc.)
- Tailwind CSS: Utility-first styling framework
- Lucide React: Icon library

**Development Tools**:
- Vite: Frontend build tool with HMR support
- Replit-specific plugins: Runtime error modal, cartographer, dev banner (development only)
- TypeScript: Type safety across full stack

**Build & Runtime**:
- esbuild: Server-side bundling for production
- tsx: TypeScript execution for development server
- Drizzle Kit: Database migration management

**Session Management**:
- connect-pg-simple: PostgreSQL session store (configured but authentication flow not fully implemented)

## Transformation Roadmap: Replit Core Clone

### Project Goal

Transform this AI Web IDE into a complete local Replit Core clone that runs on Ubuntu 24.04 with NVIDIA RTX 3060 GPU support. The system will support full prompt-to-app workflows where users type natural language requests (e.g., "Build a CRM dashboard") and the system automatically plans, codes, tests, and deploys complete applications with live preview.

### Reference Implementation

**Original Repository**: https://github.com/vicky3585/ai-ide-agent (MIT License)

The original repo provides a complete Python-based system with:
- LangGraph multi-agent orchestration (Planner → Coder → Tester)
- Docker sandbox execution with security constraints
- PostgreSQL + pgvector for vector memory storage
- vLLM integration for local GPU inference with RTX 3060
- code-server for real VS Code experience
- Live preview proxy through Nginx
- User authentication and multi-project management

### Hybrid Architecture Strategy

Instead of complete rewrite, we're implementing a **hybrid Node.js + Python system**:

**Keep Node.js/Express** for:
- Real-time WebSocket communication ✅
- File system operations and management
- Primary API server
- Fast I/O operations

**Add Python Services** for:
- LangGraph agent orchestration (new)
- vLLM local GPU inference (new)
- Advanced AI workflows

**Shared Infrastructure**:
- PostgreSQL 16 + pgvector (vector embeddings)
- Redis 7 (caching and task queue)
- Docker Compose orchestration
- Nginx reverse proxy

### Seven-Phase Implementation Plan

**Phase 1: Study & Architecture** ✅
- Analyzed original repository
- Designed hybrid architecture
- Created module upgrade plan
- Gap analysis completed (see PHASE1_ANALYSIS.md)

**Phase 2: Core IDE Features** (In Progress)
- Integrate code-server (real VS Code) in place of custom editor
- Implement Docker sandbox for code execution
- Connect terminal to sandbox with streaming output
- Build live preview proxy server
- Migrate from in-memory to PostgreSQL storage

**Phase 3: AI Prompt-to-App Workflow**
- Create Python LangGraph agent service
- Implement Planner agent (task decomposition)
- Implement Coder agent (file generation)
- Implement Tester agent (validation)
- Build auto-fix loop with 3-attempt retry

**Phase 4: Developer Tools**
- Package manager UI (npm/pip/apt)
- Project templates (React, Next.js, Flask, Vite)
- GitHub OAuth integration
- Git operations (clone, commit, push, pull)

**Phase 5: Multi-user & Security**
- JWT authentication system
- Multi-project dashboard
- Sandbox lifecycle management
- Resource limits and security controls

**Phase 6: GPU & Offline Mode**
- vLLM integration for RTX 3060
- LOCAL_FIRST routing (GPU → OpenAI fallback)
- Offline mode with cached responses
- Cost optimization with result reuse

**Phase 7: Deployment & Testing**
- Docker Compose for all services
- Ubuntu 24.04 package (.deb installer)
- Comprehensive E2E tests
- Complete documentation

### Key Technology Additions

**New Services**:
- **Python Agent Service** (Port 8001): LangGraph orchestration
- **vLLM Service** (Port 8000): Local GPU inference with CUDA 12.1
- **code-server** (Port 8443): Real VS Code in browser
- **PostgreSQL** (Port 5432): Database + vector storage
- **Redis** (Port 6379): Cache and message queue
- **Docker Sandbox**: Isolated execution environment

**New Dependencies** (to be installed):
- Python: `langgraph`, `langchain`, `fastapi`, `vllm`, `pgvector`, `sentence-transformers`
- Node.js: `dockerode`, `pg`, `ioredis`
- System: `docker`, `nvidia-docker`, `postgresql-16`, `redis`, `code-server`

### Current Implementation Status

**Completed** ✅:
- Basic IDE UI with file explorer, code editor, chat, terminal
- WebSocket real-time communication
- OpenAI GPT-4 streaming chat
- In-memory storage for workspaces and files
- React component architecture with Shadcn/UI

**In Progress** ⏳:
- Phase 1 analysis and architecture design
- Gap analysis vs target Replit Core features

**Planned**:
- All features from Phases 2-7 (see PHASE1_ANALYSIS.md for detailed breakdown)

### Success Metrics

The system will be considered complete when:
1. User can type "Build a todo app" and get a working app with live preview
2. Code execution happens in secure Docker sandbox
3. code-server (VS Code) provides full autocomplete, extensions, and IntelliSense
4. AI agents (Planner/Coder/Tester) workflow is visible in UI
5. Errors are auto-detected and fixed (up to 3 attempts)
6. vLLM runs on RTX 3060 with automatic fallback to OpenAI
7. System works fully offline with local models
8. Multiple projects can be managed from dashboard
9. GitHub repositories can be cloned and synchronized
10. Templates for React/Next.js/Flask/Vite work out of box
11. One-command installation on Ubuntu 24.04
12. All features match or exceed Replit Core Plan capabilities

### Technical Decisions Log

**2025-11-12**: Decided on hybrid Node.js + Python architecture instead of full Python rewrite. Rationale: Leverage existing WebSocket infrastructure and Node.js strengths for real-time operations while adding Python for LangGraph and vLLM where those ecosystems are strongest.

**2025-11-12**: Chose to integrate code-server instead of building custom Monaco integration. Rationale: code-server provides full VS Code experience with extensions, debugging, and all features users expect from professional IDE. This matches the original repository's approach and provides the most authentic Replit-like experience.

**2025-11-12**: Resolved Phase 2 scope to use code-server exclusively (not Monaco). The IDE will be a separate service embedded via iframe in the React UI, maintaining separation of concerns while providing full VS Code functionality.

**2025-11-12**: Selected PostgreSQL + pgvector over other vector databases. Rationale: Single database for relational data and vector embeddings reduces infrastructure complexity while pgvector provides excellent performance for semantic search.