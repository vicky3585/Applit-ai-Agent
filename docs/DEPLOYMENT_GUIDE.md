# Applit Deployment System Guide

## Overview
Applit's deployment system enables users to publish their workspace applications as static websites accessible via path-based routing (`/apps/<workspaceId>/`). This guide documents the implementation status and provides guidance for completing the deferred components.

## Architecture

### Static Hosting Pipeline
```
User triggers deploy → Build executor runs → Artifacts copied → Nginx serves
                          ↓
                    Timestamped releases
                          ↓
                    Atomic symlink swap
```

### Directory Structure
```
/var/www/ai-ide/
├── <workspaceId>/
│   ├── 20250114120000/     # Timestamped build directory
│   │   └── index.html
│   ├── 20250114130000/     # Another build
│   │   └── index.html
│   └── current -> 20250114130000/  # Symlink to active deployment
```

### Routing Pattern
- **URL**: `https://your-domain.com/apps/<workspaceId>/`
- **Example**: `https://ai-ide.local/apps/abc123/` → `/var/www/ai-ide/abc123/current/index.html`

---

## Implementation Status

### ✅ Completed (Priority 0 - Core Infrastructure)

#### 1. Data Model (shared/schema.ts)
```typescript
export const deployments = pgTable("deployments", {
  id: varchar("id").primaryKey(),
  workspaceId: varchar("workspace_id").references(() => workspaces.id, { onDelete: 'cascade' }),
  status: text("status").notNull(), // 'pending' | 'building' | 'success' | 'failed'
  buildCommand: text("build_command"),
  buildLogs: jsonb("build_logs"),
  artifactPath: text("artifact_path"),
  url: text("url"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});
```

**Features:**
- Lifecycle tracking (pending → building → success/failed)
- Build log capture (JSONB for structured logs)
- Artifact path and public URL storage
- Cascade deletion with workspace cleanup
- Index on workspaceId for fast queries

#### 2. Storage Layer (server/storage.ts, server/pg-storage.ts)
**IStorage Interface Methods:**
- `createDeployment(workspaceId, status, buildCommand?)` - Initialize deployment record
- `updateDeployment(id, updates)` - Update status, logs, artifacts, URL
- `getDeployments(workspaceId)` - List all deployments (newest first)
- `getLatestDeployment(workspaceId)` - Get most recent deployment

**PostgresStorage Implementation:**
- Full Drizzle ORM integration
- Transactional updates with `.returning()`
- Ordered by `createdAt DESC` for history viewing

**MemStorage Stubs:**
- Throws "Deployments not supported in development environment"
- Maintains API compatibility for Replit environment

#### 3. API Routes (server/routes.ts)
**Endpoints:**
- `POST /api/workspaces/:id/deploy` - Trigger deployment
  - Validates workspace ownership
  - Creates deployment record with "pending" status
  - Returns deployment ID and status
  - **TODO**: Invoke build executor (see below)

- `GET /api/workspaces/:id/deployments` - List deployment history
  - Returns all deployments for workspace
  - Includes status, timestamps, URLs

**Request/Response:**
```typescript
// POST /api/workspaces/:id/deploy
Request: { buildCommand?: string }
Response: { deployment: Deployment, message: string }

// GET /api/workspaces/:id/deployments
Response: Deployment[]
```

#### 4. Nginx Configuration (docs/nginx-templates/ai-ide-apps.conf)
**Features:**
- Path-based routing with regex capture: `/apps/<workspaceId>/*`
- SPA fallback: `try_files $uri $uri/ /apps/$workspace_id/index.html`
- Static asset caching (30 days for images/fonts/CSS/JS)
- HTML no-cache for instant updates
- Security headers (X-Frame-Options, CSP-ready)
- CORS headers (configurable)

**Installation:**
```bash
sudo cp docs/nginx-templates/ai-ide-apps.conf /etc/nginx/sites-available/ai-ide-apps.conf
sudo ln -s /etc/nginx/sites-available/ai-ide-apps.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 🚧 Deferred Components

### 1. Build Executor (server/deployment/build-executor.ts)

**Purpose:** Detect project type, run build commands, capture logs, publish artifacts

**Architecture:**
```typescript
interface BuildStrategy {
  detect(workspaceId: string): Promise<boolean>;
  build(workspaceId: string, buildCommand?: string): Promise<BuildResult>;
}

interface BuildResult {
  success: boolean;
  artifactPath?: string;
  logs: string[];
  error?: string;
}

class BuildExecutor {
  private strategies: Map<string, BuildStrategy> = new Map();
  
  registerStrategy(name: string, strategy: BuildStrategy): void;
  async execute(workspaceId: string, buildCommand?: string): Promise<BuildResult>;
}
```

**Strategy Registry:**
1. **ViteBuildStrategy**
   - Detect: Check for `vite.config.ts` or `vite.config.js`
   - Build: `npm run build` (or custom buildCommand)
   - Artifacts: `dist/` directory

2. **StaticHtmlStrategy**
   - Detect: Check for `index.html` at workspace root, no package.json
   - Build: Copy entire workspace directory
   - Artifacts: All files

3. **CreateReactAppStrategy**
   - Detect: Check for `react-scripts` in package.json
   - Build: `npm run build`
   - Artifacts: `build/` directory

**Implementation Steps:**
1. Create `server/deployment/` directory
2. Implement base `BuildStrategy` interface
3. Add strategy implementations (Vite, Static, CRA)
4. Implement `BuildExecutor` orchestrator
5. Update `POST /api/workspaces/:id/deploy` to invoke executor
6. Stream logs to deployment record via `updateDeployment()`

**Key Features:**
- **Log Streaming**: Capture stdout/stderr incrementally
- **Timeout**: Max build time (e.g., 5 minutes)
- **Rollback**: On failure, don't create artifacts directory
- **Atomic Swap**: Build to `<timestamp>` dir, then `ln -sfn <timestamp> current`
- **Cleanup**: Retain last N (e.g., 3) deployments, delete older ones

**Example Usage:**
```typescript
const executor = new BuildExecutor();
executor.registerStrategy("vite", new ViteBuildStrategy());
executor.registerStrategy("static", new StaticHtmlStrategy());

const result = await executor.execute(workspaceId, buildCommand);
if (result.success) {
  await storage.updateDeployment(deploymentId, {
    status: "success",
    artifactPath: result.artifactPath,
    url: `/apps/${workspaceId}/`,
    buildLogs: result.logs,
    completedAt: new Date(),
  });
}
```

---

### 2. Setup Script (scripts/setup-deployment.sh)

**Purpose:** Idempotent nginx + directory setup for Ubuntu 24.04

**Requirements:**
```bash
#!/bin/bash
set -e

# 1. Install nginx (if not already installed)
sudo apt update
sudo apt install -y nginx

# 2. Create deployment directories
sudo mkdir -p /var/www/ai-ide
sudo chown -R www-data:www-data /var/www/ai-ide
sudo chmod 755 /var/www/ai-ide

# 3. Copy nginx config
sudo cp docs/nginx-templates/ai-ide-apps.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/ai-ide-apps.conf /etc/nginx/sites-enabled/

# 4. Test nginx config
sudo nginx -t

# 5. Reload nginx
sudo systemctl reload nginx

echo "✅ Deployment system setup complete"
echo "📁 App directory: /var/www/ai-ide"
echo "🌐 Apps will be served at: http://localhost/apps/<workspaceId>/"
```

**Permissions:**
- `/var/www/ai-ide/` owned by `www-data:www-data`
- Directories: `755` (rwxr-xr-x)
- Files: `644` (rw-r--r--)

**Testing:**
```bash
# Manual test deployment
sudo mkdir -p /var/www/ai-ide/test-workspace/20250114120000
echo "<h1>Test Deployment</h1>" | sudo tee /var/www/ai-ide/test-workspace/20250114120000/index.html
sudo ln -sfn 20250114120000 /var/www/ai-ide/test-workspace/current
sudo chown -R www-data:www-data /var/www/ai-ide/test-workspace

# Visit: http://localhost/apps/test-workspace/
```

---

## Integration with Dev Server Manager

**Current State:**
- Dev servers run on ports 3000-4000 for live preview
- Deployments are separate static builds served via nginx

**Coordination:**
- Dev server manager does NOT stop when deploying
- Users can preview live version (dev server) and production version (deployment) simultaneously
- Dev server URL: `http://localhost:3000` (or assigned port)
- Deployment URL: `http://localhost/apps/<workspaceId>/`

**Future Enhancement:**
- Add "Deploy" button to UI that shows both preview and deployment URLs
- Display deployment status in real-time (pending → building → success)

---

## MVP Scope (Priority 0)

### In Scope:
✅ Static file serving only (HTML/CSS/JS/images)  
✅ Path-based routing (`/apps/<workspaceId>/`)  
✅ Build detection and execution (Vite, static HTML)  
✅ Deployment history tracking  
✅ Atomic deployments (zero-downtime swaps)  

### Out of Scope (Deferred):
❌ Subdomain routing (`<workspaceId>.ai-ide.local`)  
❌ SSL/TLS certificates (Let's Encrypt integration)  
❌ Custom domains  
❌ Backend application deployment (Node.js/Python servers)  
❌ Environment variables injection  
❌ Database-backed deployments  

---

## Testing Checklist

### Storage Layer:
- [x] Create deployment record via `createDeployment()`
- [x] Update deployment status via `updateDeployment()`
- [x] List deployments via `getDeployments()`
- [x] Get latest deployment via `getLatestDeployment()`

### API Routes:
- [ ] POST to `/api/workspaces/:id/deploy` creates pending deployment
- [ ] GET `/api/workspaces/:id/deployments` returns deployment list
- [ ] Unauthorized access (wrong userId) returns 403

### Nginx:
- [ ] Access `/apps/<workspaceId>/` serves `index.html`
- [ ] SPA routing works (e.g., `/apps/<workspaceId>/about`)
- [ ] Static assets cached correctly (check headers)
- [ ] HTML not cached (check `Cache-Control: no-cache`)

### Build Executor (when implemented):
- [ ] Vite project builds successfully
- [ ] Static HTML project copies correctly
- [ ] Build logs captured to database
- [ ] Timestamped directories created
- [ ] Symlink swapped atomically
- [ ] Old deployments cleaned up (keep last 3)

---

## Next Steps

1. **Implement Build Executor:**
   - Create strategy pattern framework
   - Add Vite and Static strategies
   - Integrate with deployment API route

2. **Create Setup Script:**
   - Automate nginx installation
   - Configure permissions
   - Add testing instructions

3. **Frontend UI:**
   - Add "Deploy" button to workspace UI
   - Show deployment status/history
   - Display deployment URL

4. **End-to-End Testing:**
   - Test on Ubuntu 24.04 machine
   - Validate nginx routing
   - Verify build process
   - Check deployment rollback

5. **Documentation:**
   - Add deployment guide to main README
   - Document troubleshooting steps
   - Create video walkthrough

---

## Troubleshooting

### Nginx 404 Errors:
- Check symlink exists: `ls -la /var/www/ai-ide/<workspaceId>/current`
- Verify permissions: `ls -la /var/www/ai-ide/<workspaceId>/`
- Check nginx error logs: `sudo tail -f /var/nginx/error.log`

### Build Failures:
- Review `deployment.buildLogs` in database
- Check workspace has valid build configuration
- Verify Node.js version compatibility

### Permission Denied:
- Ensure www-data owns files: `sudo chown -R www-data:www-data /var/www/ai-ide`
- Check directory permissions: `sudo chmod 755 /var/www/ai-ide/<workspaceId>`

---

## Architecture Decisions

### Why Path-Based Routing?
- **Simplicity**: Single domain, no subdomain DNS configuration
- **Security**: Easier to manage CORS and security headers
- **Portability**: Works on any server without DNS setup

### Why Atomic Symlinks?
- **Zero Downtime**: Nginx serves old version until new build is ready
- **Rollback**: Previous deployments remain accessible
- **Cleanup**: Easy to identify and delete old deployments

### Why Static-Only MVP?
- **Scope Control**: Backend deployments require Docker/containers
- **User Need**: Most use cases are static SPAs (React, Vue, Vite)
- **Complexity**: Dynamic backends need environment variables, databases, scaling

---

## References
- Nginx documentation: https://nginx.org/en/docs/
- Drizzle ORM: https://orm.drizzle.team/
- Vite build guide: https://vitejs.dev/guide/build.html
