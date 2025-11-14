# Docker Sandbox Fix for Ubuntu 24.04

## Problem Statement

When running Applit in a Docker Compose environment on Ubuntu 24.04, the API container cannot access the host's Docker daemon, causing all sandbox code execution to fail with "permission denied" or "ENOENT" errors.

## Root Cause

The API container (running inside Docker) needs Docker CLI access to create and manage sandbox containers for code execution. However:

1. **Missing Docker CLI**: The `node:20-slim` base image doesn't include Docker client tools
2. **Permission Issues**: The container user (`node`) isn't in the host's docker group
3. **Environment Variables Lost**: Using `su -` (login shell) drops all environment variables like `DATABASE_URL`, `OPENAI_API_KEY`, etc.

## Solution Overview

Three-part fix:

1. **Install Docker CLI** in the API container from official Docker repository
2. **Dynamic GID Matching**: Entrypoint script detects host Docker socket GID and adds container user to matching group
3. **Environment Preservation**: Use `su --preserve-environment` to keep env vars when dropping from root to node user

---

## Implementation Details

### 1. Dockerfile Changes

Added Docker CLI installation from official repository:

```dockerfile
# Install Docker CLI and required tools for sandbox control
RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*
```

Added entrypoint script:

```dockerfile
# Copy entrypoint script for Docker socket permissions
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Use entrypoint to handle Docker socket permissions
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["npm", "start"]
```

### 2. Entrypoint Script (`docker-entrypoint.sh`)

Key features:

- **Detects Docker socket GID** from `/var/run/docker.sock`
- **Creates docker group** with matching GID (or uses existing group)
- **Adds node user** to docker group
- **Verifies access** by running `docker ps`
- **Preserves environment** with `su --preserve-environment`
- **Comprehensive error messages** with troubleshooting steps

```bash
# Get Docker socket GID
DOCKER_SOCK_GID=$(stat -c '%g' /var/run/docker.sock)

# Create/update docker group
groupadd --gid "$DOCKER_SOCK_GID" docker

# Add node user to docker group
usermod -aG docker node

# Verify access
su - node -c "docker ps >/dev/null 2>&1"

# Run app as node user, preserving environment
exec su --preserve-environment --shell=/bin/sh node -c "cd /app && exec \"\$@\"" -- "$@"
```

### 3. Health Check Script (`scripts/check-docker.js`)

Programmatic verification of Docker access:

```javascript
import Docker from 'dockerode';

const docker = new Docker();

// Test Docker daemon connection
await docker.ping();
const version = await docker.version();
const containers = await docker.listContainers({ all: true });
```

---

## Usage

### For Ubuntu 24.04 Deployment

**Prerequisites:**

```bash
# 1. Install Docker
sudo apt install docker.io docker-compose

# 2. Add your user to docker group
sudo usermod -aG docker $USER

# 3. Log out and back in for group changes to take effect
# Or run: newgrp docker

# 4. Start Docker service
sudo systemctl enable --now docker

# 5. Verify Docker is running
docker ps  # Should work without sudo
```

**Build and Start:**

```bash
# Rebuild API container with Docker CLI
docker-compose build api

# Start all services
docker-compose up -d

# Check entrypoint logs
docker-compose logs api | grep Entrypoint

# Should see:
# [Entrypoint] Docker socket found with GID: 998
# [Entrypoint] Adding node user to docker group...
# [Entrypoint] ✅ Docker access verified successfully!
```

**Verify Docker Access:**

```bash
# Method 1: Manual test
docker-compose exec api docker ps

# Method 2: Run health check
docker-compose exec api node scripts/check-docker.js

# Should see:
# [Docker Health Check] ✅ Docker daemon is accessible
# [Docker Health Check] Docker version: 24.0.7
# [Docker Health Check] ✅ All Docker access checks passed!
```

---

## Troubleshooting

### Problem: "permission denied"

```bash
# Check if Docker socket exists
ls -la /var/run/docker.sock
# Should show: srw-rw---- 1 root docker

# Verify your host user is in docker group
groups
# Should include 'docker'

# If not, add yourself
sudo usermod -aG docker $USER
# Log out and back in

# Check entrypoint logs
docker-compose logs api | grep -A 10 "Entrypoint"

# Rebuild container
docker-compose build api
docker-compose up -d api
```

### Problem: "Docker socket not found"

```bash
# Install Docker if not installed
sudo apt install docker.io docker-compose

# Start Docker service
sudo systemctl enable --now docker

# Verify socket exists
ls -la /var/run/docker.sock

# Check docker-compose.yml mounts the socket
grep "docker.sock" docker-compose.yml
# Should show: - /var/run/docker.sock:/var/run/docker.sock
```

### Problem: "Environment variables not passed to app"

This should be fixed in the current implementation. If you still see this:

```bash
# Check entrypoint uses --preserve-environment
docker-compose exec api cat /usr/local/bin/docker-entrypoint.sh | grep preserve

# Should see: su --preserve-environment

# Verify env vars are set
docker-compose exec api env | grep DATABASE_URL
```

### Problem: "Failed to create docker group"

```bash
# Check if GID conflict exists
docker-compose exec api getent group 998  # Or whatever GID your docker socket uses

# The entrypoint should handle this automatically
# Check logs for conflict resolution
docker-compose logs api | grep "existing group"
```

---

## Security Considerations

⚠️ **IMPORTANT SECURITY NOTE**

Adding the `node` user to the Docker group grants **root-equivalent access** to the host system. This is necessary for sandbox container management but has security implications:

### What this means:
- The app can create, start, stop, and remove Docker containers
- It can mount host filesystems
- It can potentially escape the container and access the host

### When it's safe:
- ✅ Local development environments
- ✅ Private servers you control
- ✅ Trusted single-user deployments
- ✅ Internal company infrastructure

### When it's NOT safe:
- ❌ Multi-tenant systems with untrusted users
- ❌ Public-facing deployments accepting arbitrary code
- ❌ Shared hosting environments
- ❌ Systems where users can execute arbitrary code

### Production Alternatives:

For production multi-tenant systems, consider:

1. **Kubernetes with Pod Security Policies**
   - Use Kubernetes admission controllers
   - Implement resource quotas and limits
   - Use network policies for isolation

2. **Firecracker VMs**
   - AWS Firecracker for lightweight VMs
   - Better isolation than containers
   - Still fast startup times

3. **gVisor**
   - Google's application kernel for containers
   - Provides stronger isolation
   - Compatible with Docker/Kubernetes

4. **Separate Worker Nodes**
   - Isolated machines for code execution
   - No direct host access
   - Queue-based job processing

---

## Testing Checklist

After applying this fix, verify:

- [ ] Container starts without errors
- [ ] Entrypoint logs show successful Docker access setup
- [ ] `docker-compose exec api docker ps` works
- [ ] Health check passes: `docker-compose exec api node scripts/check-docker.js`
- [ ] Environment variables are preserved (check `DATABASE_URL`, `OPENAI_API_KEY`)
- [ ] Can create workspace containers via API
- [ ] Can execute code in sandbox containers
- [ ] File sync works between API and sandbox containers

## Test Sandbox Execution

```bash
# Generate a test app via Chat
# Should create files and execute them in sandbox containers

# Check sandbox container was created
docker ps -a | grep webide_workspace

# Check execution logs
docker-compose logs api | grep SandboxManager
```

---

## Files Changed

1. **Dockerfile** - Added Docker CLI installation and entrypoint
2. **docker-entrypoint.sh** - New file for permission setup
3. **scripts/check-docker.js** - New health check script
4. **docker-compose.yml** - Already had socket mount (no change needed)

---

## Next Steps

After verifying Docker sandbox works:

1. **Implement PostgreSQL Storage** (Priority 0, Task 2)
   - Replace MemStorage with PostgresStorage
   - Ensure data persists across restarts

2. **Add Simple Deployment** (Priority 0, Task 3)
   - Static site deployment via Nginx
   - Or integration with Railway/Fly.io/Vercel

3. **Production Hardening**
   - Security audit
   - Rate limiting
   - HTTPS configuration
   - Backup strategy

---

## References

- [Docker Official Debian Installation](https://docs.docker.com/engine/install/debian/)
- [Docker Socket Permissions](https://docs.docker.com/engine/install/linux-postinstall/)
- [dockerode NPM Package](https://www.npmjs.com/package/dockerode)
- [Ubuntu 24.04 Docker Guide](https://ubuntu.com/server/docs/containers-docker)
