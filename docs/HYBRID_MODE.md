# Hybrid AI Provider Mode - Complete Implementation Guide

## Overview

Applit now supports **hybrid AI provider mode** with automatic switching between OpenAI and local vLLM, plus manual provider selection via the UI.

## How It Works

### Architecture

1. **Environment Configuration** (`.env`)
   - `AI_PROVIDER`: Controls default behavior (`openai`, `vllm`, or `hybrid`)
   - `VLLM_API_BASE`: vLLM server URL (e.g., `http://localhost:8000/v1`)
   - `VLLM_MODEL_NAME`: Model name loaded in vLLM
   - `OPENAI_API_KEY`: OpenAI API key for fallback/primary use

2. **Workspace Settings** (UI per-workspace)
   - User can manually select provider in Settings modal:
     - **OpenAI GPT-4**: Forces OpenAI API (bypasses vLLM)
     - **Anthropic Claude**: Maps to OpenAI for now
     - **Local Model (vLLM)**: Forces vLLM with OpenAI fallback

3. **Provider Selection Logic**

```
┌─────────────────────────────────────────┐
│   User Selects Provider in UI          │
│   Settings Modal                        │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   Backend reads workspace settings      │
│   Maps UI → forceProvider:              │
│   - "openai" → openai                   │
│   - "local" → vllm                      │
│   - "anthropic" → openai (temp)         │
│   - undefined → use environment default │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│   createAIClient(forceProvider)         │
│   - Async health check if vLLM         │
│   - Verifies /models endpoint           │
│   - Checks models are loaded            │
│   - Caches result for 60s               │
└──────────────┬──────────────────────────┘
               │
         ┌─────┴──────┐
         │            │
         ▼            ▼
   ┌─────────┐  ┌──────────┐
   │  vLLM   │  │  OpenAI  │
   │ Healthy │  │ Fallback │
   └─────────┘  └──────────┘
```

### Health Checking System

The improved health check (`checkVLLMHealth`) now:

1. **Queries `/models` endpoint** (not just `/health`)
2. **Verifies models are loaded**: Checks `data.data` array has entries
3. **Provides clear warnings**:
   - `vLLM running but no models loaded`
   - `vLLM health check failed: 404 Not Found`
4. **Caches result for 60 seconds** to avoid API spam
5. **Runs asynchronously** before each agent workflow

## Usage Scenarios

### Scenario 1: Ubuntu User with vLLM Not Running

**Environment**: 
```bash
AI_PROVIDER=hybrid
VLLM_API_BASE=http://localhost:8000/v1
OPENAI_API_KEY=sk-...
```

**Behavior**:
- First request → Health check fails → Falls back to OpenAI
- Logs: `⚠️ vLLM configured but unhealthy, using OpenAI`
- Future requests use OpenAI (cached for 60s)

**User Action**: 
- Start vLLM server → Next request auto-discovers vLLM
- Or select "OpenAI GPT-4" in UI to skip health checks

### Scenario 2: User Manually Selects "Local Model"

**Steps**:
1. Open Settings modal
2. Select "Local Model (vLLM)"
3. Save settings
4. Send chat message

**Backend Flow**:
```typescript
settings.modelProvider = "local"
→ forceProvider = "vllm"
→ await createAIClient({ forceProvider: "vllm" })
→ Health check /models endpoint
→ If healthy: Use vLLM
→ If unhealthy: Fall back to OpenAI with warning
```

**Logs**:
```
[AI Client] Checking vLLM health at http://localhost:8000/v1...
[AI Client] vLLM health check failed: connect ECONNREFUSED
⚠️ vLLM requested but unavailable, falling back to OpenAI
```

### Scenario 3: User Manually Selects "OpenAI GPT-4"

**Backend Flow**:
```typescript
settings.modelProvider = "openai"
→ forceProvider = "openai"
→ await createAIClient({ forceProvider: "openai" })
→ Skip health check, directly use OpenAI
```

**Logs**:
```
[AI Client] ✅ Using OpenAI (explicit override)
```

### Scenario 4: Hybrid Mode Auto-Discovery

**Environment**:
```bash
AI_PROVIDER=hybrid
VLLM_API_BASE=http://localhost:8000/v1
```

**Behavior**:
- No manual selection → Uses environment default
- Health check runs automatically
- Switches to vLLM when available
- Falls back to OpenAI when vLLM unhealthy

## Code Changes Summary

### 1. Improved Health Check (`server/utils/ai-client.ts`)

**Before**:
```typescript
const response = await fetch(`${VLLM_API_BASE}/health`);
return response.ok;
```

**After**:
```typescript
const response = await fetch(`${VLLM_API_BASE}/models`);
const data = await response.json();
const hasModels = data.data?.length > 0;
return response.ok && hasModels;
```

### 2. Connected UI to Backend (`server/routes.ts`)

**Before**:
```typescript
openai: createAIClientSync() // Ignored workspace settings
```

**After**:
```typescript
// Map workspace settings to forceProvider
let forceProvider = undefined;
if (settings?.modelProvider === "local") forceProvider = "vllm";
if (settings?.modelProvider === "openai") forceProvider = "openai";

// Use async version for proper health checking
openai: await createAIClient({ forceProvider })
```

### 3. Async Client Creation

Changed from `createAIClientSync()` to `createAIClient()` to ensure health checks complete before creating the client. This fixes the race condition where manual provider selection was ignored because `vllmRuntimeAvailable` wasn't initialized yet.

## Configuration Examples

### OpenAI Only (No vLLM)
```bash
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
# No VLLM_API_BASE
```

### vLLM Only (No Fallback)
```bash
AI_PROVIDER=vllm
VLLM_API_BASE=http://localhost:8000/v1
VLLM_MODEL_NAME=meta-llama/Llama-3.1-8B-Instruct
# Fails if vLLM unavailable
```

### Hybrid (Recommended for Ubuntu)
```bash
AI_PROVIDER=hybrid
VLLM_API_BASE=http://localhost:8000/v1
VLLM_MODEL_NAME=meta-llama/Llama-3.1-8B-Instruct
OPENAI_API_KEY=sk-...
```

## Troubleshooting

### Issue: "404 Not Found" errors when vLLM configured

**Cause**: vLLM server not running or models not loaded

**Solution**:
1. Check vLLM server: `curl http://localhost:8000/v1/models`
2. Set `AI_PROVIDER=openai` in `.env` to skip vLLM
3. Or select "OpenAI GPT-4" in Settings UI

### Issue: UI selection ignored, always uses OpenAI

**Cause**: Using old sync version (`createAIClientSync`)

**Fixed**: Now uses `createAIClient()` (async) which checks health properly

### Issue: Health check spam

**Mitigation**: Results cached for 60 seconds (`HEALTH_CHECK_TTL`)

Adjust in `server/utils/ai-client.ts`:
```typescript
const HEALTH_CHECK_TTL = 60_000; // 60 seconds
```

## Testing

### Test Hybrid Mode

1. **Start with vLLM unavailable**:
   ```bash
   AI_PROVIDER=hybrid OPENAI_API_KEY=sk-... npm run dev
   ```
   → Should use OpenAI automatically

2. **Start vLLM server**:
   ```bash
   vllm serve meta-llama/Llama-3.1-8B-Instruct --port 8000
   ```
   → Next request should discover vLLM (within 60s)

3. **Test manual selection**:
   - Open Settings → Select "Local Model" → Save
   - Send chat message
   - Check logs for vLLM health check

### Test Fallback

```bash
# Stop vLLM mid-workflow
pkill -f vllm

# Send request with forceProvider="vllm"
# Should fall back to OpenAI with warning
```

## Performance Considerations

- **Health check latency**: ~100-500ms per check
- **Cache duration**: 60 seconds
- **Concurrent requests**: Share same cached health result
- **Recommendation**: Use manual "OpenAI" selection if vLLM permanently unavailable

## Future Improvements

1. **Anthropic Support**: Currently maps to OpenAI, needs separate implementation
2. **Per-agent provider**: Different models for planner/coder/tester
3. **Load balancing**: Round-robin between multiple vLLM instances
4. **Metrics**: Track provider usage, fallback frequency
5. **UI indicator**: Show active provider in real-time

## Related Files

- `server/utils/ai-client.ts` - Health checking and client creation
- `server/routes.ts` - WebSocket agent request handling
- `client/src/components/SettingsModal.tsx` - UI provider selector
- `shared/environment.ts` - Environment configuration
- `docs/VLLM_OPTIONAL.md` - Original vLLM documentation
