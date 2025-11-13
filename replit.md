# AI Web IDE - Replit Core Clone

## Overview
This project is an AI-powered Web IDE that functions as a local Replit Core clone, designed to run on Ubuntu 24.04 with NVIDIA RTX 3060 GPU support. Its primary purpose is to enable full prompt-to-app workflows, allowing users to describe desired applications in natural language. The system then automatically plans, codes, tests, and deploys these applications, providing a live preview. The project aims to integrate robust development tools, AI agents for code generation and correction, and a scalable architecture for a comprehensive development environment.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions
The frontend, built with React 18, TypeScript, and Vite, uses Shadcn/ui (Radix UI + Tailwind CSS) following a "new-york" style. It features Inter and JetBrains Mono fonts and a panel-based layout including a TopBar, FileExplorer, CodeEditor, RightPanel (Chat, Logs, Agent State, Git, Templates), and TerminalPanel.

### Technical Implementations
**Frontend:** Utilizes TanStack Query for data fetching and Wouter for lightweight routing. WebSocket clients ensure real-time communication.
**Backend:** Powered by Express.js with TypeScript. A dedicated WebSocket server manages real-time features per workspace. An abstract storage layer, currently in-memory (`MemStorage`), is designed for future PostgreSQL integration via Drizzle ORM. RESTful APIs handle CRUD operations, while WebSockets manage real-time AI agent interactions.
**AI Agent System:** Integrates with OpenAI API for GPT-powered coding. AI agents follow `idle`, `planning`, `coding`, `testing`, and `fixing` states. Communication is streamed from user chat to the server, then to OpenAI, and back to the client. Agent execution state is persisted per workspace.
**Core IDE Features:** Includes a production-ready Docker sandbox infrastructure for isolated code execution with concurrency control, supporting multi-language execution (11 languages including JavaScript, Python, Go, Rust, C/C++, Java, Ruby, PHP, Shell) via a polyglot Docker image. It features intelligent language detection, various execution modes (interpreter, compile-run, script), and build caching for compiled languages.
**Developer Tools:**
- **Package Manager:** UI component supporting npm, pip, and apt with real-time installation and progress indicators.
- **Project Templates:** A system with 6 pre-built templates (React, Vue, Express, Flask, FastAPI, Next.js) and a selection modal.
- **GitHub & Git Integration:** Implemented with argv-based execution for maximum security, eliminating shell injection risks. Supports 10 Git operations and GitHub API integration with a dedicated UI panel for status, staging, committing, pushing/pulling, and history.

### System Design Choices
The system is designed for a hybrid Node.js + Python architecture. Data storage will transition from in-memory to PostgreSQL 16 with `pgvector` for vector embeddings, managed by Drizzle ORM. The Docker sandbox provides container-per-workspace isolation with resource limits, activity tracking, and TTL-based cleanup. Security is a priority, especially in Git integration, using argv-based execution to prevent injection vulnerabilities. Future plans include multi-user support with JWT authentication, sandbox lifecycle management, and GPU integration with vLLM for local inference.

## External Dependencies

*   **AI Services**: OpenAI API (`OPENAI_API_KEY`)
*   **Database**: PostgreSQL (via Neon serverless driver, `DATABASE_URL`)
*   **UI Libraries**: Radix UI, Tailwind CSS, Lucide React
*   **Build & Runtime**: Vite, esbuild, tsx, Drizzle Kit
*   **Session Management**: connect-pg-simple
*   **Planned Services**: Python Agent Service (LangGraph), vLLM Service (local GPU inference), code-server, Redis