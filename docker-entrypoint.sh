#!/bin/bash
set -e

# Docker Socket Permission Fix for Ubuntu 24.04
# This script ensures the container can access the host's Docker socket
#
# SECURITY NOTE: This grants the 'node' user Docker socket access, which
# provides root-equivalent privileges on the host. This is required for
# sandbox container management but should only be used in trusted environments.

echo "[Entrypoint] Configuring Docker socket permissions..."

# Check if Docker socket exists
if [ -S /var/run/docker.sock ]; then
  # Get the GID of the Docker socket from the host
  DOCKER_SOCK_GID=$(stat -c '%g' /var/run/docker.sock)
  echo "[Entrypoint] Docker socket found with GID: $DOCKER_SOCK_GID"
  
  # Check if a group with this GID already exists
  EXISTING_GROUP=$(getent group "$DOCKER_SOCK_GID" | cut -d: -f1 || echo "")
  
  if [ -z "$EXISTING_GROUP" ]; then
    # No group with this GID exists, create docker group
    echo "[Entrypoint] Creating docker group with GID $DOCKER_SOCK_GID..."
    if ! groupadd --gid "$DOCKER_SOCK_GID" docker 2>/dev/null; then
      echo "[Entrypoint] ❌ ERROR: Failed to create docker group"
      echo "[Entrypoint] Host setup instructions:"
      echo "[Entrypoint]   1. Ensure Docker is installed: sudo apt install docker.io"
      echo "[Entrypoint]   2. Add your user to docker group: sudo usermod -aG docker \$USER"
      echo "[Entrypoint]   3. Restart Docker: sudo systemctl restart docker"
      exit 1
    fi
  elif [ "$EXISTING_GROUP" != "docker" ]; then
    # Group exists but with different name, use that name
    echo "[Entrypoint] Using existing group '$EXISTING_GROUP' (GID $DOCKER_SOCK_GID)"
    DOCKER_GROUP="$EXISTING_GROUP"
  else
    # docker group exists with correct GID
    echo "[Entrypoint] Docker group already exists with GID $DOCKER_SOCK_GID"
    DOCKER_GROUP="docker"
  fi
  
  # Use 'docker' as default group name if not set
  DOCKER_GROUP=${DOCKER_GROUP:-docker}
  
  # Add node user to docker group (if not already a member)
  if ! id -nG node | grep -qw "$DOCKER_GROUP"; then
    echo "[Entrypoint] Adding node user to $DOCKER_GROUP group..."
    if ! usermod -aG "$DOCKER_GROUP" node; then
      echo "[Entrypoint] ❌ ERROR: Failed to add node user to $DOCKER_GROUP group"
      exit 1
    fi
  fi
  
  # Verify Docker access
  echo "[Entrypoint] Verifying Docker access..."
  if su - node -c "docker ps >/dev/null 2>&1"; then
    echo "[Entrypoint] ✅ Docker access verified successfully!"
  else
    echo "[Entrypoint] ⚠️  WARNING: Docker access verification failed"
    echo "[Entrypoint] Sandbox code execution may not work"
    echo "[Entrypoint]"
    echo "[Entrypoint] Troubleshooting steps:"
    echo "[Entrypoint]   1. Check Docker socket exists: ls -la /var/run/docker.sock"
    echo "[Entrypoint]   2. Verify host Docker is running: docker ps"
    echo "[Entrypoint]   3. Check host user is in docker group: groups"
    echo "[Entrypoint]   4. Ensure socket is mounted in compose file"
    echo "[Entrypoint]"
    echo "[Entrypoint] Continuing startup anyway..."
  fi
else
  echo "[Entrypoint] ⚠️  WARNING: Docker socket not found at /var/run/docker.sock"
  echo "[Entrypoint] Sandbox code execution will NOT work"
  echo "[Entrypoint]"
  echo "[Entrypoint] To fix this on Ubuntu 24.04:"
  echo "[Entrypoint]   1. Install Docker: sudo apt install docker.io docker-compose"
  echo "[Entrypoint]   2. Start Docker: sudo systemctl enable --now docker"
  echo "[Entrypoint]   3. Verify socket: ls -la /var/run/docker.sock"
  echo "[Entrypoint]   4. Check docker-compose.yml mounts the socket"
  echo "[Entrypoint]"
  echo "[Entrypoint] Continuing startup anyway (app will use MockSandbox)..."
fi

# Execute the command as node user (preserving environment variables)
echo "[Entrypoint] Starting application as node user..."
# Use gosu to drop privileges while preserving environment variables
# gosu is specifically designed for this use case and properly passes all arguments
exec gosu node "$@"
