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