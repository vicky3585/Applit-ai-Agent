# Deployment Guide

## Current State (As of 2025-11-12)

This project is in active development with a hybrid architecture designed to work both on Replit (for development) and Ubuntu 24.04 (for production deployment).

### ✅ What Works Now

**On Replit (Development Mode):**
- ✅ Full React IDE UI with file explorer, code editor, chat panel, terminal UI
- ✅ Real-time WebSocket communication
- ✅ OpenAI GPT-4 streaming chat responses
- ✅ In-memory file and workspace storage
- ✅ Terminal UI (commands are logged but not executed - mock sandbox)
- ✅ Environment detection system
- ✅ Hybrid infrastructure framework

**Both Environments:**
- ✅ REST API for file/workspace management
- ✅ Chat message persistence
- ✅ Agent state tracking

### ⚠️ Known Limitations (To Be Fixed)

**Critical Issues Identified by Architecture Review:**

1. **Docker Sandbox Integration** (Issue #1):
   - **Problem**: API server cannot communicate with Docker sandbox container from within Docker Compose
   - **Current State**: docker-compose.yml exists but not integrated
   - **Solution Needed**: Either mount Docker socket to API container OR restructure network communication
   - **Impact**: Terminal execution, package installation, code running don't work in local mode yet

2. **File Persistence** (Issue #2):
   - **Problem**: Files only exist in RAM (MemStorage), not synced to filesystem
   - **Current State**: Sandbox cannot access files because they're not on disk
   - **Solution Needed**: Implement file sync layer or use database with volume mounts
   - **Impact**: Cannot execute files or install packages in their context

3. **Environment Detection Accuracy** (Issue #3):
   - **Problem**: Reports services as available without runtime validation
   - **Current State**: Hard-coded assumptions based on env vars
   - **Solution Needed**: Add actual service health checks and reachability tests
   - **Impact**: May advertise features that don't work

4. **PostgreSQL Migration** (Issue #4):
   - **Problem**: Still using in-memory storage even in "local" mode
   - **Current State**: PostgreSQL service defined but not connected
   - **Solution Needed**: Implement Drizzle ORM storage adapter
   - **Impact**: Data doesn't persist across restarts

## Local Ubuntu 24.04 Deployment Plan

### Prerequisites

```bash
# Install Docker and Docker Compose
sudo apt-get update
sudo apt-get install -y docker.io docker-compose

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# For GPU support (RTX 3060)
# Install NVIDIA drivers
sudo ubuntu-drivers install

# Install nvidia-docker
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update && sudo apt-get install -y nvidia-docker2
sudo systemctl restart docker
```

### Step 1: Clone and Configure

```bash
git clone <your-repo-url>
cd ai-web-ide

# Create environment file
cp .env.example .env

# Edit .env and set:
# DEPLOYMENT_ENV=local
# OPENAI_API_KEY=<your-key>
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/webide
# CODE_SERVER_URL=http://localhost:8443
# IDE_PASSWORD=<secure-password>
```

### Step 2: Start Services

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Check service health
docker-compose ps
```

### Step 3: Initialize Database

```bash
# Run migrations (once PostgreSQL adapter is implemented)
npm run db:push
```

### Step 4: Access the IDE

- **Web IDE**: http://localhost:5000
- **code-server**: http://localhost:8443 (password: from IDE_PASSWORD env var)
- **API**: http://localhost:5000/api
- **Preview**: http://localhost:9090 (for running apps)

## Roadmap to Production-Ready

### Phase 2A: Fix Critical Issues (Next Steps)

**Priority 1: Docker Communication**
- [ ] Option A: Mount `/var/run/docker.sock` to API container
- [ ] Option B: Use Docker-in-Docker (DinD) approach
- [ ] Option C: Restructure to use Docker exec from host
- [ ] Document chosen approach and test end-to-end

**Priority 2: File Persistence**
- [ ] Implement file sync: MemStorage → Filesystem volume
- [ ] OR: Implement PostgreSQL storage adapter with Drizzle ORM
- [ ] Ensure sandbox can access synced files at `/workspace`
- [ ] Test file creation → execution workflow

**Priority 3: Environment Validation**
- [ ] Add runtime service health checks
- [ ] Implement actual Docker socket connectivity test
- [ ] Add PostgreSQL connection validation
- [ ] Update ENV_CONFIG to reflect real availability

**Priority 4: Integration Testing**
- [ ] Create end-to-end test: file create → execute → see output
- [ ] Test package installation flow
- [ ] Verify terminal command execution
- [ ] Test on actual Ubuntu 24.04 machine

### Phase 2B: Complete Core IDE (After Fixes)

- [ ] Integrate real code-server (iframe embedding)
- [ ] Implement live preview proxy
- [ ] Add file tree operations (create/rename/delete folders)
- [ ] Complete PostgreSQL migration

### Phase 3-7: Advanced Features

See PHASE1_ANALYSIS.md for full roadmap.

## Testing Strategy

### On Replit (Current)
```bash
# Run application
npm run dev

# Test chat functionality
# Open browser, send chat message, verify AI response

# Test mock sandbox
# Try terminal commands, verify they log but don't execute
```

### On Local Ubuntu (After Fixes)
```bash
# Start all services
docker-compose up -d

# Test real execution
curl -X POST http://localhost:5000/api/workspaces/default-workspace/terminal/execute \
  -H "Content-Type: application/json" \
  -d '{"command": "echo Hello World"}'

# Should return actual output, not mock
```

## Architecture Notes

### Current Hybrid Approach

```
┌─────────────────────────────────────────┐
│         Replit (Development)             │
│                                          │
│  ┌──────────┐   ┌──────────┐           │
│  │ Frontend │   │ Backend  │           │
│  │ (React)  │◄─►│(Node.js) │           │
│  └──────────┘   └────┬─────┘           │
│                      │                  │
│                 ┌────▼────┐             │
│                 │  Mock   │             │
│                 │ Sandbox │             │
│                 └─────────┘             │
│                  (Logs only)            │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│      Local Ubuntu (Production)           │
│                                          │
│  ┌──────────┐   ┌──────────┐           │
│  │ Frontend │   │ Backend  │           │
│  │ (React)  │◄─►│(Node.js) │           │
│  └──────────┘   └────┬─────┘           │
│                      │                  │
│  ┌───────┬──────┬────▼────┬────────┐  │
│  │ code- │      │ Docker  │  vLLM  │  │
│  │server │      │Sandbox  │ (GPU)  │  │
│  └───────┘      └─────────┘└────────┘  │
│                                          │
│  ┌──────────────┬────────────────┐      │
│  │  PostgreSQL  │     Redis      │      │
│  │  + pgvector  │     Cache      │      │
│  └──────────────┴────────────────┘      │
└──────────────────────────────────────────┘
```

### Recommended Fix: Docker Socket Mount

**Update docker-compose.yml**:
```yaml
services:
  # ... existing services ...
  
  api:
    build: .
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # ADD THIS
      - ./:/app
    environment:
      DOCKER_HOST: unix:///var/run/docker.sock
```

This allows the API container to control Docker on the host, enabling it to execute commands in the sandbox container.

## Support

For issues or questions:
1. Check this guide first
2. Review PHASE1_ANALYSIS.md for architecture details
3. See replit.md for current implementation status
4. Open an issue on GitHub

---

**Last Updated**: 2025-11-12  
**Status**: Phase 2 infrastructure in progress with known issues  
**Next Milestone**: Fix Docker communication and file persistence
