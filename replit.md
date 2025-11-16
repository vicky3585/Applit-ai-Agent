# Applit - AI-Powered Development Environment

## Overview
Applit is an AI-powered Web IDE designed for "prompt-to-app" workflows, allowing users to describe applications in natural language. It automates planning, coding, testing, and deployment, offering a live preview within a split-screen editor. The system integrates essential development tools, AI agents, file persistence, hot reload capabilities, and a scalable architecture to provide a comprehensive development environment. Its core ambition is to simplify and accelerate the entire software development lifecycle through intelligent automation, aiming to achieve Replit feature parity while introducing unique innovations.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend uses React 18, TypeScript, and Vite, styled with Shadcn/ui (Radix UI + Tailwind CSS) in a "new-york" theme. It features Inter and JetBrains Mono fonts and a panel-based layout including a TopBar, FileExplorer, CodeEditor, RightPanel (Chat, Logs, Agent State, Git, Templates), TerminalPanel, and a split-screen PreviewPane. Design elements prioritize professional aesthetics, including gradient backgrounds, smooth transitions, and enhanced visual indicators across dashboard and authentication interfaces.

### Technical Implementations
**Frontend:** Utilizes TanStack Query for data fetching, Wouter for routing, and WebSocket clients for real-time communication. Monaco Editor is integrated with Y-Monaco bindings for collaborative editing.
**Authentication System:** Implements JWT-based authentication with refresh token rotation, managed via httpOnly cookies. Features include session management with atomic cap enforcement, progressive account lockout, token reuse detection, and server-side session validation for all access tokens.
**Backend:** Developed with Express.js and TypeScript. A dedicated WebSocket server manages real-time features. An abstract storage layer (MemStorage for in-memory, PostgresStorage for PostgreSQL) adheres to the IStorage contract. RESTful APIs handle CRUD operations, and WebSockets facilitate real-time AI agent interactions and collaborative editing via a Yjs Provider.
**AI Multi-Agent System:** Comprises Planner, Coder, and Tester agents that coordinate to analyze requests, generate, and validate code. It includes an auto-fix loop with error feedback learning and an Orchestrator that manages the Planner→Coder→Tester→Fix workflow, broadcasting real-time state and enhancing error handling. A hybrid AI provider system supports OpenAI, Anthropic, and local vLLM, with robust health checks and automatic fallback.
**Autonomous Workflow:** Features a template-based generation system, auto-package detection and installation, and automatic development server spawning. A progress timeline UI visualizes workflow phases, and the system includes error handling with retry logic and durable state management. Autonomy levels (low, medium, high, max) are configurable per workspace.
**Enhanced Logging & Feedback System:** Incorporates a structured log schema and a centralized StructuredLogger utility. Frontend UI components display logs grouped by phase with filtering controls, including detailed command execution displays with real-time stdout/stderr output from agent operations.
**Transparency & Developer Experience (Phase 1 Complete):**
- *Command Execution Display:* Real-time command output displayed in activity logs with stdout/stderr streams, command metadata (exit codes, duration), and visual separation between commands and logs
- *Server Status Indicators:* Color-coded status badges (green/yellow/red/gray) in PreviewPane showing dev server health, with automatic health checks (30s intervals) and restart on failure
- *File Change Tracking:* FilesChangedPanel component in IDE right panel showing generated files in collapsible cards with file type badges, path display, and content preview toggle
- *Export Workspace:* One-click ZIP export functionality via archiver library, accessible from TopBar download button, with proper streaming and error handling
**Core IDE Features:** Includes a dual-layer file persistence system, a hot reload system using chokidar, a dev server manager, a Docker-based code execution sandbox, and a live preview system with iframe HMR stripping. Developer tools encompass a Package Manager UI, Project Templates, GitHub & Git Integration, Live Preview Pane, Settings Modal, Command Palette, and Keyboard Shortcuts.
**Multiplayer Foundation:** Utilizes a Yjs Persistence Layer for document storage, Y.Awareness for real-time user presence (cursors, selections), and a Follow Mode for tracking collaborators.
**Multi-Project Support:** Provides REST API endpoints for managing workspaces with ownership verification.
**Static App Deployment System:** Features a data model for deployment lifecycle tracking, storage layer integration, API routes for triggering and listing deployments, and an Nginx template for routing and caching.

### System Design Choices
The system uses a hybrid Node.js + Python architecture. Data storage employs both in-memory (MemStorage) and PostgreSQL (PostgresStorage) implementing the IStorage contract, with concurrency managed by JavaScript's event loop and row-level locking respectively. Authentication uses JWTs with refresh token rotation, bcrypt hashing, and a progressive account lockout mechanism. PostgreSQL storage is fully operational for core functionality, data persistence, and Yjs persistence, leveraging transactions and advisory locks. A key-value store abstraction supports Redis in production and in-memory storage for development, with a complete REST API for key management.

## External Dependencies

*   **AI Services**: OpenAI API, vLLM (optional local GPU inference with hybrid fallback)
*   **Database**: PostgreSQL (via Neon serverless driver)
*   **UI Libraries**: Radix UI, Tailwind CSS, Lucide React
*   **Build & Runtime**: Vite, esbuild, tsx, Drizzle Kit
*   **Session Management**: connect-pg-simple