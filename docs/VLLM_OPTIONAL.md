# vLLM Integration - Optional Feature

**IMPORTANT: vLLM is completely optional.** Applit works perfectly with just OpenAI API. Local GPU inference is a cost-saving feature for advanced users.

## Quick Start (Recommended)

### Use OpenAI Only
```bash
# In your .env file:
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

That's it! Applit will work perfectly with OpenAI GPT-4 and GPT-3.5-turbo.

---

## Why vLLM is Optional

### Automatic Fallback
Applit automatically falls back to OpenAI if:
- `VLLM_API_BASE` is not configured
- vLLM server is not responding
- vLLM health check fails

### System Behavior
```
✅ OpenAI mode: Always works (requires OPENAI_API_KEY)
⚠️  vLLM mode: Attempts vLLM → Falls back to OpenAI if unavailable
⚠️  Hybrid mode: Attempts vLLM → Falls back to OpenAI if unavailable
```

---

## Known vLLM Installation Issues

### Issue 1: `pyairports` Import Error

**Symptom:**
```
ModuleNotFoundError: No module named 'pyairports'
```

**Cause:** vLLM 0.6.3's dependency `outlines` requires `pyairports`, but the package has broken distribution on some PyPI mirrors.

**Solutions:**

#### Option A: Use OpenAI Only (Recommended)
```bash
# .env
AI_PROVIDER=openai
```

#### Option B: Install from Source
```bash
pip uninstall pyairports -y
pip install git+https://github.com/mborsetti/pyairports.git
```

#### Option C: Downgrade Outlines
```bash
pip install "outlines<0.0.46"
```

---

### Issue 2: GPU Memory Errors

**Symptom:**
```
RuntimeError: Failed to create unquantized linear weights
torch.OutOfMemoryError: CUDA out of memory
```

**Cause:** 
- vLLM ≥0.11.0 uses new v1 engine with higher memory overhead
- 7B models need ~8-9GB VRAM but RTX 3060 only has 12GB total

**Solutions:**

#### Option A: Use vLLM 0.6.3 (Legacy Engine)
```bash
pip install vllm==0.6.3.post1
```

#### Option B: Reduce Memory Settings
```bash
# In start script:
--gpu-memory-utilization 0.70
--max-model-len 2048
```

#### Option C: Use Smaller Models
Try TinyLlama-1.1B (~2GB) or Qwen2.5-Coder-7B (more efficient than DeepSeek)

---

## Docker Alternative (Advanced)

For guaranteed vLLM compatibility, use Docker:

```bash
# Pull vLLM Docker image
docker pull vllm/vllm-openai:latest

# Run vLLM server
docker run --gpus all \
  -p 8000:8000 \
  --ipc=host \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-Coder-7B-Instruct \
  --gpu-memory-utilization 0.8
```

---

## Configuration Reference

### OpenAI Only (Recommended for Most Users)
```bash
# .env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

### Hybrid Mode (Advanced - Requires Working vLLM)
```bash
# .env
AI_PROVIDER=hybrid
OPENAI_API_KEY=sk-...
VLLM_API_BASE=http://localhost:8000/v1
VLLM_MODEL_NAME=Qwen/Qwen2.5-Coder-7B-Instruct
```

### vLLM Only (Expert - Not Recommended)
```bash
# .env
AI_PROVIDER=vllm
VLLM_API_BASE=http://localhost:8000/v1
VLLM_MODEL_NAME=Qwen/Qwen2.5-Coder-7B-Instruct
OPENAI_API_KEY=sk-...  # Still needed as fallback
```

---

## Current Limitations

### Hybrid Mode Not Fully Implemented
**Status:** The codebase has hybrid mode infrastructure, but all agents currently use the same client. True hybrid routing (vLLM for planning/testing, OpenAI for coding) is not yet active.

**Workaround:** Use `AI_PROVIDER=openai` for best experience.

---

## Troubleshooting

### Check vLLM Health
```bash
curl http://localhost:8000/health
```
Expected: `{}` (empty JSON)

### View Applit Logs
When Applit starts, look for:
```
[AI Client] ✅ Using OpenAI API (openai mode)
[AI Client] ⚠️  vLLM configured but not responding, falling back to OpenAI
```

### Test vLLM Directly
```bash
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model-name",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 50
  }'
```

---

## Recommended Setup for RTX 3060 (12GB)

If you want to use local GPU inference, this is the most reliable setup:

```bash
# 1. Create fresh venv
python3 -m venv vllm-venv
source vllm-venv/bin/activate

# 2. Install PyTorch with CUDA
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# 3. Install vLLM 0.6.3 (stable)
pip install vllm==0.6.3.post1

# 4. Fix pyairports if needed
pip install git+https://github.com/mborsetti/pyairports.git

# 5. Download model
huggingface-cli download Qwen/Qwen2.5-Coder-7B-Instruct

# 6. Start server
python -m vllm.entrypoints.openai.api_server \
  --model Qwen/Qwen2.5-Coder-7B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --gpu-memory-utilization 0.80 \
  --max-model-len 4096 \
  --dtype float16 \
  --trust-remote-code
```

---

## Support

If vLLM setup fails after trying these solutions:
1. **Use OpenAI only** - The core Applit experience is identical
2. File an issue at https://github.com/vicky3585/Applit-ai-Agent/issues
3. Include error logs and GPU specs

**Remember:** vLLM is a cost-optimization feature, not a requirement. Applit is fully functional with OpenAI API alone.
