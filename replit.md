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