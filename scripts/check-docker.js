#!/usr/bin/env node
/**
 * Docker Access Health Check
 * 
 * Verifies that the application can communicate with the Docker daemon.
 * This is critical for sandbox code execution to work.
 */

import Docker from 'dockerode';

async function checkDockerAccess() {
  try {
    const docker = new Docker();
    
    console.log('[Docker Health Check] Testing Docker daemon connection...');
    
    // Ping Docker daemon
    await docker.ping();
    console.log('[Docker Health Check] ✅ Docker daemon is accessible');
    
    // Get Docker version
    const version = await docker.version();
    console.log(`[Docker Health Check] Docker version: ${version.Version}`);
    console.log(`[Docker Health Check] API version: ${version.ApiVersion}`);
    
    // List containers to verify permissions
    const containers = await docker.listContainers({ all: true });
    console.log(`[Docker Health Check] Found ${containers.length} containers`);
    
    // Check if we can access the socket
    const info = await docker.info();
    console.log(`[Docker Health Check] Docker info: ${info.Containers} containers, ${info.Images} images`);
    
    console.log('[Docker Health Check] ✅ All Docker access checks passed!');
    process.exit(0);
  } catch (error) {
    console.error('[Docker Health Check] ❌ Docker access check failed:');
    console.error(`[Docker Health Check] Error: ${error.message}`);
    console.error('');
    console.error('[Docker Health Check] Troubleshooting steps:');
    console.error('[Docker Health Check]   1. Verify Docker socket is mounted:');
    console.error('[Docker Health Check]      ls -la /var/run/docker.sock');
    console.error('[Docker Health Check]   2. Check host Docker is running:');
    console.error('[Docker Health Check]      docker ps');
    console.error('[Docker Health Check]   3. Verify user permissions:');
    console.error('[Docker Health Check]      groups');
    console.error('[Docker Health Check]   4. Check entrypoint logs for permission setup');
    console.error('');
    
    // Check if it's a permission issue
    if (error.code === 'EACCES' || error.message.includes('permission denied')) {
      console.error('[Docker Health Check] This appears to be a permission issue.');
      console.error('[Docker Health Check] The container user may not be in the docker group.');
      console.error('[Docker Health Check] Check the entrypoint script output above.');
    }
    
    // Check if socket doesn't exist
    if (error.code === 'ENOENT' || error.message.includes('ENOENT')) {
      console.error('[Docker Health Check] Docker socket not found.');
      console.error('[Docker Health Check] Ensure /var/run/docker.sock is mounted in docker-compose.yml');
    }
    
    process.exit(1);
  }
}

checkDockerAccess();
