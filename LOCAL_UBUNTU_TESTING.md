# Local Ubuntu Testing Guide

This guide explains how to test the full auto-start dev server functionality on Ubuntu 24.04 with NVIDIA RTX 3060.

## Prerequisites

### System Requirements
- **OS**: Ubuntu 24.04 LTS
- **GPU**: NVIDIA RTX 3060 (optional, for GPU features)
- **RAM**: Minimum 8GB recommended
- **Storage**: 20GB free space

### Required Software

#### 1. Docker Installation
```bash
# Update package index
sudo apt update

# Install Docker
sudo apt install -y docker.io

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add user to docker group (logout/login required after)
sudo usermod -aG docker $USER

# Verify Docker is running
docker ps
```

#### 2. PostgreSQL Installation
```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database user and database
sudo -u postgres psql -c "CREATE USER webide WITH PASSWORD 'webide';"
sudo -u postgres psql -c "CREATE DATABASE webide OWNER webide;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE webide TO webide;"
```

#### 3. Node.js 20 Installation
```bash
# Install Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x
npm --version
```

#### 4. NVIDIA Drivers (for GPU features)
```bash
# Check if NVIDIA GPU is detected
lspci | grep -i nvidia

# Install NVIDIA drivers
sudo apt install -y nvidia-driver-535

# Reboot system
sudo reboot

# Verify installation (after reboot)
nvidia-smi
```

---

## Environment Setup

### 1. Clone Repository
```bash
git clone <your-repo-url>
cd ai-web-ide
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env` file in the project root:

```bash
# Database Connection
DATABASE_URL=postgresql://webide:webide@localhost:5432/webide

# OpenAI API Key (required for AI features)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Session Secret
SESSION_SECRET=your-random-secret-key-here

# Environment (leave unset or set to 'local')
# ENV=local  # Optional - defaults to 'local' if REPL_ID not set

# GPU Configuration (optional)
# CUDA_VISIBLE_DEVICES=0
```

### 4. Initialize Database Schema
```bash
# Push database schema
npm run db:push

# If prompted with data loss warning, use force:
npm run db:push --force
```

### 5. Verify Docker Access
```bash
# Test Docker is accessible
docker run hello-world

# Should see: "Hello from Docker!"
```

---

## Running the Application

### Start Development Server
```bash
npm run dev
```

Expected output:
```
[Environment] Running on: local
[Environment] Database: local
[Environment] Sandbox: docker (available: true)
[Environment] Code Server: docker
[Environment] Python Agent: docker (available: true)
[Environment] AI Provider: hybrid
[Environment] GPU: Yes (0)
10:00:00 AM [express] serving on port 5000
```

### Verify Environment Detection
Check the server logs for:
- ✅ `[Environment] Running on: local`
- ✅ `[Environment] Sandbox: docker (available: true)`
- ❌ NOT `Running on: replit`
- ❌ NOT `Sandbox: mock (available: false)`

---

## Testing Auto-Start Dev Server (Tasks 2-6)

### Test 1: Template Application with Auto-Start

1. **Open IDE**: Navigate to `http://localhost:5000`

2. **Apply Template**:
   - Click Templates tab in right panel
   - Select "React + Vite (TypeScript)"
   - Click "Apply Template" button

3. **Verify Auto-Start**:
   - Watch Chat/Logs panel for progress messages:
     - ✅ "Applying template..."
     - ✅ "Syncing files to disk..."
     - ✅ "Starting dev server..."
     - ✅ "Dev server running on port XXXX"
   - Should **NOT** see: "start dev server manually in Terminal"

4. **Verify Dev Server**:
   ```bash
   # Check dev server process is running
   ps aux | grep "npm run dev"
   
   # Verify files written to disk
   ls -la /tmp/workspaces/default-workspace/
   ```

5. **Test Preview**:
   - Click Preview tab
   - Preview should show **running Vite app** (not static HTML)
   - Look for Vite + React logos
   - Check network tab: requests go to `localhost:XXXX`

6. **Test Hot Module Replacement (HMR)**:
   - Open `src/App.tsx` in editor
   - Change heading text: "Vite + React" → "HMR Test"
   - **Save file** (Ctrl+S)
   - Preview should **auto-update** without full page reload
   - New text appears within 1-2 seconds

### Test 2: AI Code Generation with Auto-Start

1. **Reset Workspace**: Delete all files from current workspace

2. **Generate Code**: Type in chat:
   ```
   Create a simple TODO app with React and TypeScript
   ```

3. **Verify Workflow**:
   - AI Agent runs (Planner → Coder → Tester)
   - Files appear in File Explorer
   - After code generation completes:
     - ✅ "Syncing files to disk..."
     - ✅ "Starting dev server..."
     - ✅ "Dev server running on port XXXX"

4. **Verify Preview**: Same as Template test above

### Test 3: WebSocket HMR Verification

1. **Open Browser DevTools**:
   - Press F12
   - Go to Network tab
   - Filter: "WS" (WebSockets)

2. **Check WebSocket Connections**:
   - `/ws` - IDE WebSocket (should be connected)
   - `/yjs/*` - Collaborative editing (should be connected)
   - `localhost:XXXX` - Dev server HMR (should be connected)

3. **Edit File and Monitor**:
   - Edit any React component
   - Watch WebSocket messages in DevTools
   - Should see HMR update messages
   - **NO** "localhost:undefined" errors

---

## Expected Behavior Summary

### ✅ On Local Ubuntu (Docker Available)

| Feature | Expected Behavior |
|---------|------------------|
| Environment Detection | `local` |
| Sandbox Availability | `true` (Docker) |
| Template Application | Files written → Dev server auto-starts |
| AI Code Generation | Code generated → Dev server auto-starts |
| Preview | Proxies to live dev server |
| WebSocket HMR | Works correctly (no `undefined` errors) |
| File Edits | Trigger instant HMR updates |

### ❌ Known Issues

- **First run may take longer**: Docker image pulls on first template
- **Port conflicts**: If port 5173 is in use, dev server picks random port
- **GPU not required**: Auto-start works without GPU, GPU only for AI features

---

## Troubleshooting

### Dev Server Not Auto-Starting

**Symptom**: Shows "start dev server manually in Terminal"

**Causes**:
1. Docker not running
   ```bash
   sudo systemctl start docker
   ```

2. Docker socket permission
   ```bash
   sudo chmod 666 /var/run/docker.sock
   ```

3. Environment misdetected as Replit
   ```bash
   # Check for REPL_ID variable (should be empty)
   echo $REPL_ID
   
   # If set, unset it
   unset REPL_ID
   ```

### Database Connection Errors

**Symptom**: "Connection refused" or "database does not exist"

**Solution**:
```bash
# Restart PostgreSQL
sudo systemctl restart postgresql

# Verify database exists
sudo -u postgres psql -l | grep webide

# Recreate database if needed
sudo -u postgres psql -c "DROP DATABASE IF EXISTS webide;"
sudo -u postgres psql -c "CREATE DATABASE webide OWNER webide;"

# Push schema again
npm run db:push --force
```

### Docker Permission Denied

**Symptom**: "permission denied while trying to connect to Docker daemon"

**Solution**:
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Logout and login again (or reboot)
sudo reboot
```

### Preview Shows 504 Gateway Timeout

**Symptom**: Preview iframe shows "504 Gateway Timeout"

**Possible Causes**:
1. Dev server crashed - check logs
2. Port forwarding issue - restart workflow
3. WebSocket proxy not initialized

**Solution**:
```bash
# Check dev server processes
ps aux | grep "vite\|npm"

# Check server logs
tail -f /tmp/logs/Start_application_*.log

# Restart application
npm run dev
```

---

## Comparing Replit vs Local

| Feature | Replit | Local Ubuntu |
|---------|--------|--------------|
| Environment | `replit` | `local` |
| Docker/Sandbox | ❌ Not available | ✅ Available |
| Dev Server Auto-Start | ❌ Manual start | ✅ Auto-start |
| Preview | Static files only | ✅ Live proxy + HMR |
| File Persistence | ✅ Works | ✅ Works |
| WebSocket | ✅ `/ws`, `/yjs` work | ✅ All WebSockets work |
| Vite HMR Warning | ⚠️ Cosmetic warning | ✅ No warnings |

---

## Performance Testing

### Benchmark Template Application

```bash
# Time template application + dev server start
time curl -X POST http://localhost:5000/api/workspaces/test-workspace/apply-template \
  -H "Content-Type: application/json" \
  -d '{"templateId": "react-vite-ts"}'
```

Expected timing:
- File creation: < 1s
- Disk sync: < 2s
- Dev server start: 5-10s (first run), 2-3s (subsequent)
- Total: < 15s

### Verify HMR Latency

1. Edit file in Monaco editor
2. Measure time until preview updates
3. Expected: **< 2 seconds**

---

## Cleanup

### Remove Workspace Files
```bash
sudo rm -rf /tmp/workspaces/*
```

### Reset Database
```bash
sudo -u postgres psql -c "DROP DATABASE webide;"
sudo -u postgres psql -c "CREATE DATABASE webide OWNER webide;"
npm run db:push --force
```

### Stop Docker Containers
```bash
docker ps -a | grep ide | awk '{print $1}' | xargs docker rm -f
```

---

## Additional Resources

- **Docker Documentation**: https://docs.docker.com/
- **PostgreSQL Documentation**: https://www.postgresql.org/docs/
- **NVIDIA Docker**: https://github.com/NVIDIA/nvidia-docker
- **Vite Documentation**: https://vitejs.dev/

---

Last Updated: November 14, 2025
