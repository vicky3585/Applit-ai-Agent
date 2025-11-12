# Phase 1: Architecture Analysis & Upgrade Plan

## Original Repository Analysis

**Repository**: https://github.com/vicky3585/ai-ide-agent (MIT License)

### Existing Architecture

The original repo is a **Python-based microservices system** with 8 Docker services:

```
┌───────────────────────────────────────────────────────────────┐
│                    Nginx Reverse Proxy (:8080)                 │
└───┬──────────────────┬────────────────┬───────────────────────┘
    │                  │                │
┌───▼────────┐  ┌──────▼──────┐  ┌─────▼─────┐
│  React UI  │  │  FastAPI    │  │code-server│
│  :3000     │  │  Backend    │  │  :8443    │
└────────────┘  │  :8000      │  └───────────┘
                └──────┬──────┘
                       │
              ┌────────▼─────────┐
              │ LangGraph Agent  │
              │  Service :8001   │
              └────────┬─────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
    │ Planner │  │  Coder  │  │ Tester  │
    │  Agent  │  │  Agent  │  │  Agent  │
    └─────────┘  └────┬────┘  └─────────┘
                      │
              ┌───────▼────────┐
              │  Model Router  │
              │  LOCAL_FIRST   │
              └───┬────────┬───┘
                  │        │
        ┌─────────▼──┐  ┌──▼────────┐
        │   vLLM     │  │  OpenAI   │
        │  (GPU)     │  │  (Cloud)  │
        └────────────┘  └───────────┘

Data Stores:
┌──────────────┐  ┌───────────────┐  ┌─────────────┐
│ PostgreSQL + │  │     Redis     │  │  Docker     │
│   pgvector   │  │   Cache       │  │  Sandbox    │
└──────────────┘  └───────────────┘  └─────────────┘
```

### Key Features They Have

1. **LangGraph Multi-Agent System**
   - Planner: Decomposes tasks into steps
   - Coder: Generates production code
   - Tester: Validates and tests code
   - Checkpointing for human-in-the-loop approval

2. **Docker Sandbox Execution**
   - Seccomp syscall filtering
   - Resource limits (1GB RAM, 1 CPU)
   - Non-root user (UID 1001)
   - Network isolation
   - Secure file permissions

3. **Vector Memory (pgvector)**
   - Stores conversation context
   - Semantic search with embeddings
   - Persistent learning across sessions

4. **Local GPU Support (vLLM)**
   - RTX 3060 optimized
   - CUDA 12.1 support
   - Model routing: LOCAL_FIRST, CLOUD_ONLY, LOCAL_ONLY
   - Automatic fallback to OpenAI

5. **VS Code Web (code-server)**
   - Full VS Code experience in browser
   - Extension support
   - Shared workspace with agents

6. **Live Preview Proxy**
   - Runs apps in sandbox
   - Proxies through Nginx
   - Hot reload support

7. **Authentication & Multi-tenancy**
   - JWT authentication
   - User/organization management
   - API key management
   - Rate limiting

## Current Implementation Gap Analysis

### What We Have ✅
- React frontend with custom IDE UI components
- Node.js/Express backend
- WebSocket real-time communication
- OpenAI GPT-4 integration with streaming
- File explorer and code editor UI
- Terminal UI (not functional)
- Chat panel with AI responses
- In-memory storage for files/workspaces

### What We're Missing ❌

| Feature | Original Repo | Our Implementation | Gap |
|---------|--------------|-------------------|-----|
| **Backend Language** | Python/FastAPI | Node.js/Express | Need to keep Node or rewrite |
| **AI Architecture** | LangGraph 3-agent system | Single OpenAI chat | Need multi-agent orchestration |
| **Code Execution** | Docker sandbox | None | Need Docker integration |
| **IDE** | code-server (real VS Code) | Custom editor UI | Need code-server integration |
| **Storage** | PostgreSQL + pgvector | In-memory | Need database + vector store |
| **Authentication** | JWT auth system | None | Need user system |
| **Local AI** | vLLM with GPU | None | Need vLLM integration |
| **Package Manager** | npm/pip integration | None | Need package installer |
| **Git Integration** | Full GitHub sync | None | Need Git operations |
| **Live Preview** | Nginx proxy to sandbox | None | Need preview server |
| **Templates** | Project scaffolding | None | Need template system |
| **Memory** | Vector search | None | Need pgvector |

## Proposed Hybrid Architecture

Instead of completely rewriting in Python, we'll create a **hybrid system** that keeps our Node.js strengths while adding Python where needed:

```
┌─────────────────────────────────────────────────────────────┐
│              Nginx Reverse Proxy (:5000)                     │
└────┬──────────────┬──────────────┬────────────────┬─────────┘
     │              │              │                │
┌────▼─────┐  ┌────▼────┐  ┌──────▼──────┐  ┌────▼────────┐
│ React UI │  │ Node.js │  │  Python     │  │ code-server │
│ (Exists) │  │ Express │  │  LangGraph  │  │ (New)       │
│          │  │ (Exists)│  │  Agent      │  │             │
│          │  │         │  │  (New)      │  │             │
└──────────┘  └────┬────┘  └──────┬──────┘  └─────────────┘
                   │              │
                   │     ┌────────▼─────────┐
                   │     │  Planner/Coder/  │
                   │     │  Tester Agents   │
                   │     └────────┬─────────┘
                   │              │
                   └──────────────┴─────────┐
                                            │
                   ┌────────────────────────▼──┐
                   │  Shared Services           │
                   │  - PostgreSQL + pgvector   │
                   │  - Redis cache             │
                   │  - Docker Sandbox          │
                   │  - vLLM (GPU)              │
                   └────────────────────────────┘
```

### Service Breakdown

| Service | Language | Port | Purpose |
|---------|----------|------|---------|
| **Frontend** | React/TS | 5173 | IDE UI (existing, enhanced) |
| **API Server** | Node.js | 5000 | Main backend, WebSocket, file ops |
| **Agent Service** | Python | 8001 | LangGraph multi-agent workflow |
| **code-server** | Go/TS | 8443 | Real VS Code in browser |
| **Sandbox** | Docker | - | Isolated code execution |
| **PostgreSQL** | - | 5432 | Data + vector storage |
| **Redis** | - | 6379 | Cache/queue |
| **vLLM** | Python | 8000 | Local GPU inference |
| **Nginx** | - | 80/443 | Reverse proxy |

## Implementation Strategy

### Keep Our Stack (Node.js/React)
**Reasons:**
1. Already have working WebSocket infrastructure
2. Better for real-time file operations
3. Easier npm package management
4. Faster for I/O-heavy operations
5. Less rewrite effort

### Add Python Services Where Needed
**New Python Services:**
1. **LangGraph Agent Service** - AI orchestration
2. **vLLM Service** - Local GPU inference

### Integration Points
- Node.js ↔ Python: REST API + Redis queue
- Both access same PostgreSQL database
- Shared Docker volumes for workspace files

## Data Model Extensions

### New Tables Needed

```sql
-- Users & Auth
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE,
  username VARCHAR UNIQUE,
  password_hash VARCHAR,
  created_at TIMESTAMP
);

-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name VARCHAR,
  created_at TIMESTAMP
);

-- Vector Memory
CREATE TABLE agent_memory (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  workspace_id UUID,
  content TEXT,
  embedding VECTOR(1536),
  metadata JSONB,
  created_at TIMESTAMP
);

-- Agent Executions
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY,
  workspace_id UUID,
  task TEXT,
  status VARCHAR,
  plan JSONB,
  result JSONB,
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);

-- Checkpoints (for human approval)
CREATE TABLE checkpoints (
  id UUID PRIMARY KEY,
  run_id UUID REFERENCES agent_runs(id),
  state JSONB,
  requires_approval BOOLEAN,
  approved BOOLEAN,
  created_at TIMESTAMP
);
```

## Module Upgrade Plan

### Phase 2 Modules (Core IDE)

| Module | Current State | Target State | Effort |
|--------|--------------|--------------|--------|
| **File Explorer** | React component | Add create/rename/delete ops | 2h |
| **Code Editor** | Custom UI | Embed code-server iframe | 3h |
| **Terminal** | UI only | Connect to Docker sandbox | 6h |
| **Live Preview** | None | Nginx proxy to sandbox | 4h |
| **Workspace Persistence** | In-memory | PostgreSQL storage | 3h |

### Phase 3 Modules (AI Agent)

| Module | Current State | Target State | Effort |
|--------|--------------|--------------|--------|
| **Agent Orchestration** | None | Python LangGraph service | 8h |
| **Planner Agent** | None | Task decomposition | 4h |
| **Coder Agent** | OpenAI chat | File generation with plan | 6h |
| **Tester Agent** | None | pytest/validation | 4h |
| **Auto-fix Loop** | None | 3-attempt retry logic | 3h |

### Phase 4 Modules (Developer Tools)

| Module | Current State | Target State | Effort |
|--------|--------------|--------------|--------|
| **Package Manager** | None | npm/pip UI + API | 5h |
| **Templates** | None | React/Flask/Next.js scaffolds | 4h |
| **GitHub Integration** | None | OAuth + Git operations | 8h |

### Phase 5 Modules (Multi-user & Security)

| Module | Current State | Target State | Effort |
|--------|--------------|--------------|--------|
| **Authentication** | None | JWT + user signup/login | 6h |
| **Multi-project Dashboard** | None | Project list + switcher | 4h |
| **Sandbox Manager** | None | Docker lifecycle | 6h |
| **Resource Limits** | None | CPU/memory constraints | 2h |

### Phase 6 Modules (GPU & Offline)

| Module | Current State | Target State | Effort |
|--------|--------------|--------------|--------|
| **vLLM Integration** | None | Local model serving | 6h |
| **Model Router** | OpenAI only | LOCAL_FIRST routing | 4h |
| **Offline Cache** | None | Response caching | 3h |
| **GPU Setup Scripts** | None | CUDA/driver automation | 3h |

### Phase 7 Modules (Deployment)

| Module | Current State | Target State | Effort |
|--------|--------------|--------------|--------|
| **Docker Compose** | None | All services configured | 4h |
| **Ubuntu Package** | None | .deb with installer | 6h |
| **Documentation** | Basic | Complete setup guide | 4h |
| **E2E Tests** | None | Playwright test suite | 6h |

## Technology Stack Decisions

### Frontend
- **React 18** ✅ (existing)
- **code-server** (embedded VS Code, replaces custom editor)
- **WebSocket** ✅ (existing)
- **TanStack Query** ✅ (existing)

### Backend
- **Node.js/Express** ✅ (existing, primary API)
- **Python/FastAPI** (new, for agent service)
- **PostgreSQL 16** (new, replaces in-memory)
- **Redis 7** (new, for caching/queue)

### AI/ML
- **OpenAI GPT-4** ✅ (existing)
- **LangGraph** (new, agent orchestration)
- **vLLM** (new, local inference)
- **pgvector** (new, embeddings storage)

### Infrastructure
- **Docker & Docker Compose**
- **Nginx** (reverse proxy)
- **code-server** (VS Code web)
- **Ubuntu 24.04** (deployment target)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Complexity of LangGraph** | High | Start with simple workflow, iterate |
| **GPU driver issues** | Medium | Provide detailed setup docs, fallback to OpenAI |
| **Docker security** | High | Use proven seccomp profile from original repo |
| **Database migration** | Medium | Keep in-memory as fallback during development |
| **Two-language stack** | Medium | Clear API contracts, good documentation |

## Success Criteria

By the end of Phase 7, the system must:

1. ✅ **Prompt-to-App**: Type "Build a todo app" → Get working app
2. ✅ **Live Preview**: See app running in browser immediately
3. ✅ **Code Editing**: Full code-server (VS Code) with autocomplete and extensions
4. ✅ **AI Agents**: Planner → Coder → Tester workflow visible
5. ✅ **Auto-fix**: Errors automatically detected and fixed (3 attempts)
6. ✅ **Local GPU**: vLLM running on RTX 3060 with fallback
7. ✅ **Offline Mode**: Works without internet (local models only)
8. ✅ **Multi-project**: Dashboard with project management
9. ✅ **GitHub Sync**: Clone/commit/push repositories
10. ✅ **Templates**: React, Next.js, Flask, Vite ready to go
11. ✅ **Security**: Sandboxed execution, no host access
12. ✅ **Ubuntu Package**: One-command installation

## Next Steps

1. ✅ Complete Phase 1 analysis (this document)
2. ⏳ Update replit.md with new architecture
3. ⏳ Install PostgreSQL and migrate storage
4. ⏳ Integrate code-server (VS Code web)
5. ⏳ Implement Docker sandbox execution
6. ⏳ Build Python LangGraph agent service
7. ⏳ Add vLLM local GPU support
8. ⏳ Create Ubuntu deployment package

---

**Document Version**: 1.0.0  
**Date**: November 12, 2025  
**Author**: AI Web IDE Team
