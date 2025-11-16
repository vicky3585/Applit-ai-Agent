# Applit - AI-Powered Development Environment

**Developed by Flying Venture System**

## Overview
Applit is an AI-powered Web IDE designed for "prompt-to-app" workflows, enabling users to describe applications in natural language. It automates planning, coding, testing, and deployment, offering a live preview within a split-screen editor. The system integrates essential development tools, AI agents, file persistence, hot reload capabilities, and a scalable architecture to provide a comprehensive development environment. Its core ambition is to simplify and accelerate the entire software development lifecycle through intelligent automation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, and Vite, styled with Shadcn/ui (Radix UI + Tailwind CSS) in a "new-york" theme. It features Inter and JetBrains Mono fonts and a panel-based layout including a TopBar, FileExplorer, CodeEditor, RightPanel (Chat, Logs, Agent State, Git, Templates), TerminalPanel, and a split-screen PreviewPane.

### Technical Implementations
**Frontend:** Utilizes TanStack Query for data fetching, Wouter for routing, and WebSocket clients for real-time communication. The Monaco Editor is integrated with Y-Monaco bindings for collaborative editing.

**Authentication System:** Implements JWT-based authentication with refresh token rotation, managed via httpOnly cookies. It includes session management with atomic cap enforcement, progressive account lockout, and token reuse detection.

**Backend:** Developed with Express.js and TypeScript. A dedicated WebSocket server manages real-time features. An abstract storage layer (MemStorage for in-memory, PostgresStorage for PostgreSQL) adheres to the IStorage contract. RESTful APIs handle CRUD operations, and WebSockets facilitate real-time AI agent interactions and collaborative editing via a Yjs Provider.

**AI Multi-Agent System:** Comprises Planner, Coder, and Tester agents that coordinate to analyze requests, generate, and validate code. It includes an auto-fix loop with error feedback learning and an Orchestrator that manages the Planner→Coder→Tester→Fix workflow, broadcasting real-time state and enhancing error handling.

**Autonomous Workflow:** Features a template-based generation system for deterministic project scaffolding, auto-package detection and installation, and automatic development server spawning based on project type. A progress timeline UI visualizes workflow phases, and the system includes error handling with retry logic and durable state management.

**Enhanced Logging & Feedback System:** Incorporates a structured log schema and a centralized StructuredLogger utility for consistent log creation. Frontend UI components display logs grouped by phase with filtering controls.

**Core IDE Features:**
- **File Persistence System:** Dual-layer storage (in-memory + disk) with security measures.
- **Hot Reload System:** Uses chokidar for file watching and WebSockets for real-time preview updates.
- **Dev Server Manager:** Automatically detects application types and spawns development servers with port management.
- **Code Execution System:** Docker-based sandbox for isolated, multi-language code execution with real-time output streaming.
- **Live Preview System:** Features iframe HMR stripping and network-aware preview URLs to ensure proper rendering across environments.
- **Developer Tools:** Includes a Package Manager UI, Project Templates, GitHub & Git Integration, Live Preview Pane, Settings Modal, Command Palette, and Keyboard Shortcuts.

**Multiplayer Foundation:**
- **Yjs Persistence Layer:** Manages Yjs document storage with debounced auto-save and save-on-disconnect.
- **User Presence System:** Leverages Y.Awareness for real-time cursor/selection tracking.
- **Follow Mode:** Allows users to track another collaborator's active file.

**Multi-Project Support:** Implements REST API endpoints for managing workspaces with ownership verification and name validation.

**Static App Deployment System:** Features a data model for deployment lifecycle tracking, storage layer integration, API routes for triggering and listing deployments, and an Nginx template for path-based routing, SPA fallback, and static asset caching.

### System Design Choices
The system uses a hybrid Node.js + Python architecture. Data storage uses both in-memory (MemStorage) and PostgreSQL (PostgresStorage) implementing the IStorage contract. Concurrency in MemStorage is managed by JavaScript's event loop, while PostgresStorage uses row-level locking for atomic operations. Authentication uses JWTs with refresh token rotation, bcrypt hashing, and a progressive account lockout mechanism. PostgreSQL storage is fully operational for core functionality, data persistence, and Yjs persistence, with transaction-based agent execution updates and advisory locks for session management.

## External Dependencies

*   **AI Services**: OpenAI API, vLLM (optional local GPU inference with hybrid fallback)
*   **Database**: PostgreSQL (via Neon serverless driver)
*   **UI Libraries**: Radix UI, Tailwind CSS, Lucide React
*   **Build & Runtime**: Vite, esbuild, tsx, Drizzle Kit
*   **Session Management**: connect-pg-simple

## Recent Improvements (Nov 2025)

### Hybrid AI Provider System
- **Robust vLLM Health Checks**: Now validates `/models` endpoint to verify models are loaded, not just server availability
- **UI-Backend Integration**: Settings modal model provider selection (OpenAI/Anthropic/Local vLLM) properly connected to backend
- **Automatic Fallback**: Gracefully switches between OpenAI and vLLM based on runtime availability
- **Async Client Creation**: Fixed race condition where manual provider selection was ignored due to health check timing
- **Manual Override Support**: Users can force specific provider via UI, bypassing automatic detection
- **60s Health Cache**: Prevents API spam while allowing rapid recovery when vLLM becomes available

See `docs/HYBRID_MODE.md` for complete implementation details.

### Week 1 Strategic Improvements (Nov 2025)

**Real-time Multiplayer Collaboration (Priority #1)**
- **Yjs Backend Provider**: WebSocket server initialized on `/yjs/*` paths with Y-websocket provider for document synchronization
- **WorkspaceAwarenessProvider**: Frontend provider connects to `/yjs/${workspaceId}/workspace-presence` for real-time user presence
- **User Presence System**: UserListPanel shows all active collaborators with avatar indicators
- **Collaborative Cursors**: Multi-user cursor tracking ready (requires Monaco binding integration)
- **Architecture**: Separate WebSocket paths - `/ws` for chat/agent, `/yjs/*` for collaboration, no conflicts
- **Status**: ✅ Backend provider active, frontend provider enabled, ready for multi-user testing

**AI Autonomy Levels (Priority #2)**
- **Database Schema**: Added `autonomyLevel` enum field to `workspaceSettings` table with values: low, medium, high, max
- **Default Behavior**: New workspaces default to "medium" autonomy level
- **Settings UI**: SettingsModal includes autonomy level selector with 4 levels:
  - **Low**: Agent asks approval before each code change
  - **Medium**: Agent works in 5-minute focused bursts, then asks for next steps
  - **High**: Agent works until task completion, minimal interruptions
  - **Max**: Fully autonomous mode with no interruptions
- **API Integration**: Settings endpoint updated to persist autonomy preferences per workspace
- **Status**: ✅ Complete (schema + UI + API + persistence)

**Redis Key-Value Store (Priority #3)**
- **Storage Abstraction**: `IKVStore` interface with RedisKVStore and MemoryKVStore implementations
- **Automatic Fallback**: Uses Redis in production (Ubuntu), in-memory Map in development (Replit)
- **Features**: Standard operations (get, set, delete, exists, keys, expire, ttl) with automatic cleanup
- **API Endpoints**: Complete REST API at `/api/workspaces/:id/kv/*`:
  - `GET /api/workspaces/:id/kv` - List all keys with optional pattern matching
  - `GET /api/workspaces/:id/kv/:key` - Get value by key
  - `POST /api/workspaces/:id/kv` - Set key-value pair (with optional TTL)
  - `DELETE /api/workspaces/:id/kv/:key` - Delete key
- **Key Namespacing**: Workspace-scoped keys (`workspace:${id}:${key}`) prevent collisions
- **Status**: ✅ Backend complete (API + storage layer), UI browser pending

**Authentication Security Hardening (Nov 16, 2025)**
- **Session-Based Token Validation**: Access tokens now include `sessionId` and are validated against active sessions in database on every request
  - Prevents token reuse after logout - sessions revoked from DB immediately invalidate ALL tokens
  - Added `getSession(id)` method to IStorage, MemStorage, and PostgresStorage
  - `getUserFromToken()` enforces server-side session lookup before accepting any token
- **Unified Authentication Flow**: All authentication entry points now use `getUserFromToken` for consistent session validation:
  - `authMiddleware` - REST API authentication
  - `getAuthenticatedUser` / `getAuthenticatedUserId` - Helper utilities
  - WebSocket join authentication - Real-time collaboration
  - `/api/auth/ws-token` endpoint - WebSocket token generation
- **Cookie-Parser Integration**: Fixed missing cookie-parser middleware - cookies now properly parsed for httpOnly authentication
- **Enhanced Logout**: Properly revokes sessions from database + clears httpOnly cookies with correct expiry headers
- **Code Consistency**: Replaced all 76 `await storage.` references with `storageInstance` throughout routes.ts
- **Signup Form Implementation**: Replaced React Hook Form with simple controlled inputs using useState for signup form
  - Login form retains React Hook Form (working correctly)
  - Signup uses direct value/onChange handlers for better compatibility with testing tools
  - Client-side validation via Zod schema before submission
  - Backend API validates all inputs server-side for security
- **Security Result**: Access tokens become immediately invalid after logout (not just after 15min expiry) - complete session control achieved
- **Test Results**: End-to-end tests confirm successful signup (user registration, database insertion, UI transition to login)
- **Status**: ✅ Complete (backend security + frontend signup fully functional and tested)

**Professional Dashboard UI (Nov 16, 2025)**
- **Enhanced Header**: Sticky header with backdrop blur, professional branding with Sparkles icon overlay, user profile dropdown with avatar (initials), username/email display, and logout functionality
- **Improved Workspace Cards**: Professional styling with hover-elevate effects, visual indicators (Code2 and Sparkles icons), smooth transitions, border styling, and color-transitioning delete buttons
- **Enhanced Empty State**: Professional centered layout with rounded background circle, clear messaging explaining workspace purpose, and shadow-enhanced CTA button
- **Professional Footer**: Copyright with dynamic year (© {new Date().getFullYear()}), **Flying Venture System** branding (bold), three-column responsive layout, backdrop blur matching header
- **Subtle Animations**: Transition classes on cards (transition-all duration-200), hover elevation effects, color transitions on interactive elements, pulse animation on loading state
- **Visual Polish**: Gradient background across entire page (bg-gradient-to-br from-background via-background to-muted/20), professional loading state, cohesive design system
- **Status**: ✅ Complete (architect-reviewed, production-ready, all functionality preserved)

**Strategic Context**
These improvements directly support the 12-week roadmap goal of achieving Replit feature parity while introducing unique innovations. Week 1 focused on critical infrastructure (multiplayer, AI autonomy, persistent storage) that unblocks subsequent weeks of feature development.