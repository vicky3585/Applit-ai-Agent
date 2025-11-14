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

**Core IDE Features:**
- **File Persistence System:** Dual-layer storage (in-memory + disk) with security measures against path traversal.
- **Hot Reload System:** Uses chokidar for file watching and WebSockets for real-time preview updates.
- **Dev Server Manager:** Automatically detects application types (Node.js, Python, Vite, static HTML) and spawns development servers with port management.
- **Code Execution System:** Docker-based sandbox for isolated, multi-language code execution (JavaScript, Python, Go, Rust, C/C++, Java, Ruby, PHP, Shell) with real-time output streaming.
- **Developer Tools:** Includes a Package Manager UI (npm, pip, apt), Project Templates, GitHub & Git Integration, Live Preview Pane, Settings Modal, Command Palette, and Keyboard Shortcuts.

**Multiplayer Foundation:**
- **Yjs Persistence Layer:** Manages Yjs document storage with debounced auto-save and save-on-disconnect functionality, ensuring data persistence and restoration.
- **User Presence System:** Leverages Y.Awareness for real-time cursor/selection tracking and user presence indicators in the editor and file explorer.
- **Follow Mode:** Allows users to track another collaborator's active file, with UI indicators and multiple exit mechanisms.

**Multi-Project Support:** Implements REST API endpoints for managing workspaces (create, list, delete) with ownership verification and name validation.

### System Design Choices
The system is built on a hybrid Node.js + Python architecture. Data storage uses both in-memory (MemStorage) for the Replit environment and PostgreSQL 16 (PostgresStorage) for local Ubuntu, both implementing the IStorage contract. Concurrency in MemStorage is managed by JavaScript's event loop, while PostgresStorage uses row-level locking for atomic session operations. Authentication uses JWTs with refresh token rotation, bcrypt hashing for refresh tokens, and a progressive account lockout mechanism.

## External Dependencies

*   **AI Services**: OpenAI API
*   **Database**: PostgreSQL (via Neon serverless driver)
*   **UI Libraries**: Radix UI, Tailwind CSS, Lucide React
*   **Build & Runtime**: Vite, esbuild, tsx, Drizzle Kit
*   **Session Management**: connect-pg-simple