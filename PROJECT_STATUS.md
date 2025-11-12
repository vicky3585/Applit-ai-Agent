# AI Web IDE → Replit Core Clone - Project Status

**Last Updated**: November 12, 2025  
**Current Phase**: Phase 2 (Core IDE Infrastructure)  
**Overall Progress**: ~15% Complete (Phase 1 done, Phase 2 partial)

---

## 🎯 Project Goal

Transform this AI Web IDE into a complete local Replit Core clone running on Ubuntu 24.04 with NVIDIA RTX 3060 GPU support. Enable full prompt-to-app workflows where users type "Build a CRM dashboard" and the system automatically plans, codes, tests, and deploys complete applications with live preview.

**Reference**: Based on https://github.com/vicky3585/ai-ide-agent

---

## ✅ Completed Work

### Phase 1: Architecture & Planning (100% Complete)

**Deliverables**:
- ✅ Studied original repository architecture (Python/LangGraph/Docker)
- ✅ Designed hybrid Node.js + Python architecture
- ✅ Created comprehensive gap analysis (PHASE1_ANALYSIS.md)
- ✅ Documented 7-phase implementation roadmap
- ✅ Resolved Monaco vs code-server decision (chose code-server)
- ✅ Architect review approved

**Documents Created**:
- `PHASE1_ANALYSIS.md` - Complete architecture analysis
- `replit.md` updates - Transformation roadmap
- Technical decision log

### Phase 2: Core IDE Infrastructure (40% Complete)

**Completed**:
- ✅ Environment detection module (`shared/environment.ts`)
  - Detects Replit vs local Ubuntu
  - Configures services per environment
  - Service availability checks

- ✅ Hybrid storage factory (`server/storage-factory.ts`)
  - Abstracts storage implementation
  - In-memory for Replit
  - Prepared for PostgreSQL on local

- ✅ Docker sandbox with mock fallback (`server/sandbox.ts`)
  - DockerSandbox for local execution
  - MockSandbox for Replit development
  - Supports Python, JS, TS, Shell execution

- ✅ Terminal execution APIs (`server/routes.ts`)
  - POST `/api/workspaces/:id/terminal/execute`
  - POST `/api/workspaces/:id/files/:fileId/execute`
  - POST `/api/workspaces/:id/packages/install`

- ✅ Docker Compose configuration (`docker-compose.yml`)
  - PostgreSQL 16 + pgvector
  - Redis 7
  - code-server (VS Code web)
  - Ubuntu sandbox container

**In Progress**:
- ⏳ Fixing critical Docker communication issues
- ⏳ Implementing file persistence layer
- ⏳ Improving environment detection accuracy

---

## ⚠️ Known Issues (Architect Review Findings)

### Critical Issues Requiring Fixes:

1. **Docker Sandbox Communication** (Priority: HIGH)
   - **Problem**: API container cannot reach sandbox container
   - **Impact**: Terminal execution, code running, package install don't work locally
   - **Fix Needed**: Mount Docker socket to API container or restructure networking
   - **ETA**: Fix before continuing to Phase 3

2. **File Persistence** (Priority: HIGH)
   - **Problem**: Files only in RAM, not synced to filesystem
   - **Impact**: Sandbox cannot access files to execute them
   - **Fix Needed**: Implement MemStorage → filesystem sync or PostgreSQL adapter
   - **ETA**: Fix before continuing to Phase 3

3. **Environment Detection** (Priority: MEDIUM)
   - **Problem**: Reports services as available without validation
   - **Impact**: May advertise non-functional features
   - **Fix Needed**: Add runtime health checks
   - **ETA**: Fix before Phase 2 completion

4. **PostgreSQL Not Connected** (Priority: MEDIUM)
   - **Problem**: Still using in-memory even in "local" mode
   - **Impact**: No data persistence across restarts
   - **Fix Needed**: Implement Drizzle ORM adapter
   - **ETA**: Complete in Phase 2B

**Note**: These issues are expected in a hybrid development approach. The Replit version works for UI/chat development. Local Ubuntu deployment will have full functionality once fixes are applied.

---

## 📋 Remaining Work

### Phase 2B: Fix & Complete Core IDE (3-5 days)

**Must Fix Before Phase 3**:
- [ ] Fix Docker socket communication
- [ ] Implement file persistence/sync
- [ ] Add service health validation
- [ ] Test end-to-end on Ubuntu 24.04

**Complete Phase 2**:
- [ ] Integrate code-server (iframe embedding)
- [ ] Implement live preview proxy
- [ ] PostgreSQL storage adapter
- [ ] File tree operations (create/rename/delete)

### Phase 3: AI Prompt-to-App Workflow (1-2 weeks)

- [ ] Python LangGraph service setup
- [ ] Planner agent (task decomposition)
- [ ] Coder agent (file generation)
- [ ] Tester agent (validation)
- [ ] Auto-fix loop (3 attempts)
- [ ] End-to-end orchestration

### Phase 4: Developer Tools (1 week)

- [ ] Package manager UI
- [ ] Project templates (React, Next.js, Flask, Vite)
- [ ] GitHub OAuth integration
- [ ] Git operations (clone, commit, push, pull)

### Phase 5: Multi-user & Security (1 week)

- [ ] JWT authentication
- [ ] Multi-project dashboard
- [ ] Sandbox lifecycle management
- [ ] Resource limits and controls

### Phase 6: GPU & Offline (1-2 weeks)

- [ ] vLLM integration for RTX 3060
- [ ] LOCAL_FIRST routing (GPU → OpenAI fallback)
- [ ] Offline mode with cached responses
- [ ] Cost optimization

### Phase 7: Deployment & Testing (1 week)

- [ ] Complete Docker Compose setup
- [ ] Ubuntu 24.04 installer package (.deb)
- [ ] Comprehensive E2E tests
- [ ] Documentation (setup, API, usage)

**Total Estimated Time**: 6-9 weeks of full-time development

---

## 🚀 What Works Right Now

### On Replit (Current Environment):
- ✅ Beautiful IDE UI with file explorer, code editor, chat, terminal
- ✅ Real-time WebSocket communication
- ✅ OpenAI GPT-4 streaming chat
- ✅ File and workspace management (in-memory)
- ✅ Mock terminal (logs commands)
- ✅ All UI components functional

**Try it**: Open the IDE, create files, chat with AI, see agent responses stream in real-time!

### On Local Ubuntu (After Phase 2 Fixes):
- 🔄 Everything above PLUS:
- 🔄 Real code execution in Docker sandbox
- 🔄 Actual terminal with command output
- 🔄 Package installation (npm, pip)
- 🔄 File execution (Python, JS, TS)
- 🔄 VS Code in browser (code-server)
- 🔄 Data persistence (PostgreSQL)

---

## 📚 Documentation

**Created**:
- `PHASE1_ANALYSIS.md` - Architecture analysis & module breakdown
- `DEPLOYMENT_GUIDE.md` - Local Ubuntu deployment instructions
- `PROJECT_STATUS.md` - This file
- `docker-compose.yml` - Service orchestration config
- `replit.md` (updated) - Transformation roadmap

**Code Modules**:
- `shared/environment.ts` - Environment detection
- `server/storage-factory.ts` - Storage abstraction
- `server/sandbox.ts` - Code execution sandbox
- `server/routes.ts` - API endpoints with terminal execution

---

## 🎓 Key Architectural Decisions

**2025-11-12**: Hybrid Node.js + Python architecture
- **Rationale**: Leverage existing WebSocket/real-time capabilities while adding Python for LangGraph/vLLM
- **Trade-off**: More complex but plays to strengths of each ecosystem

**2025-11-12**: code-server instead of Monaco
- **Rationale**: Full VS Code experience with extensions, debugging, all features users expect
- **Trade-off**: Heavier but more authentic IDE

**2025-11-12**: Hybrid Replit/Local deployment strategy
- **Rationale**: Test incrementally on Replit, deploy full-featured to Ubuntu
- **Trade-off**: Need environment-specific code paths but enables rapid iteration

**2025-11-12**: Docker socket mount approach for sandbox
- **Rationale**: Simplest way for API to control sandbox container
- **Trade-off**: Requires Docker socket access (security consideration for production)

---

## 🔮 Success Criteria (Final Deliverable)

The system will be complete when a user can:

1. ✅ Type "Build a todo app" and get a working app with live preview
2. ✅ See code execution happen in secure Docker sandbox  
3. ✅ Use code-server (VS Code) with full autocomplete and extensions
4. ✅ Watch AI agents (Planner/Coder/Tester) workflow in UI
5. ✅ Have errors auto-detected and fixed (up to 3 attempts)
6. ✅ Run vLLM on RTX 3060 with automatic OpenAI fallback
7. ✅ Work fully offline with local models
8. ✅ Manage multiple projects from dashboard
9. ✅ Clone and sync GitHub repositories
10. ✅ Use templates (React/Next.js/Flask/Vite) instantly
11. ✅ Install with one command on Ubuntu 24.04
12. ✅ Match or exceed all Replit Core Plan capabilities

---

## 🛠️ Next Steps

**Immediate (This Session)**:
1. Document critical issues in deployment guide ✅
2. Update project status ✅
3. Create action plan for Phase 2 fixes
4. Provide user with honest progress report

**Next Session (Phase 2 Fixes)**:
1. Fix Docker communication (mount socket)
2. Implement file persistence
3. Add service health checks
4. Test on Ubuntu 24.04 VM

**Future Sessions**:
1. Complete Phase 2B
2. Begin Phase 3 (LangGraph agents)
3. Progressive implementation through Phase 7

---

## 💡 Recommendations

**For User**:

1. **Test Current Version**: The Replit version works great for UI/chat development. Try creating files, chatting with AI, exploring the IDE interface.

2. **Local Testing**: To test Docker features, you'll need an Ubuntu 24.04 machine or VM with Docker installed.

3. **Realistic Timeline**: This is 6-9 weeks of full-time development work. Each phase builds on the previous. Quality takes time!

4. **Incremental Value**: Even partial completion provides value:
   - Phase 2 = Working local IDE with execution
   - Phase 3 = AI agent system
   - Phase 4-7 = Production features

5. **Consider Existing Tools**: If you need this functionality immediately, consider:
   - Using actual Replit Core (what we're cloning)
   - Contributing to the original ai-ide-agent repo
   - Focusing on specific features you need most

**For Development**:

1. Fix Phase 2 critical issues before proceeding
2. Test each component on real Ubuntu before marking complete
3. Keep hybrid approach - it enables faster iteration
4. Document honestly - better to underpromise and overdeliver

---

**Project Status**: On Track, with Known Issues  
**Confidence Level**: High (architecture is sound, execution plan is clear)  
**Risk Level**: Medium (complexity high, but mitigated by phased approach)  

**Ready to continue? Yes!** Let's fix the Phase 2 issues and keep building!
