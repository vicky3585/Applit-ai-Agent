# vLLM Setup Guide for Applit (Ubuntu 24.04 + NVIDIA RTX 3060)

This guide will help you set up a local vLLM server on Ubuntu with your NVIDIA RTX 3060 GPU for hybrid AI inference (OpenAI + local vLLM).

## Overview

**What is vLLM?**
- High-performance LLM inference engine (up to 24x faster than HuggingFace Transformers)
- OpenAI-compatible API (drop-in replacement)
- Optimized for NVIDIA GPUs with PagedAttention

**Hybrid Mode Benefits:**
- 💰 **Cost savings**: Use free local GPU for planning/testing tasks
- ⚡ **Speed**: Local inference eliminates API latency
- 🎯 **Flexibility**: Fall back to OpenAI GPT-4 for critical code generation

---

## Prerequisites

1. **Ubuntu 24.04** (or 22.04)
2. **NVIDIA RTX 3060** (12GB VRAM)
3. **CUDA 11.8+** (12.x recommended)
4. **Python 3.10-3.12**
5. **8GB+ VRAM free** for the model

---

## Step 1: Install CUDA (if not installed)

```bash
# Check if CUDA is installed
nvidia-smi

# If not installed, install CUDA 12.x
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update
sudo apt-get -y install cuda-toolkit-12-4

# Add CUDA to PATH
echo 'export PATH=/usr/local/cuda/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc
```

---

## Step 2: Create Python Virtual Environment

```bash
# Navigate to project root
cd ~/Applit-ai-Agent

# Create venv for vLLM (separate from main project)
python3 -m venv vllm-venv
source vllm-venv/bin/activate

# Upgrade pip
pip install --upgrade pip
```

---

## Step 3: Install vLLM

```bash
# Install vLLM with CUDA support (auto-detects CUDA version)
pip install vllm

# Verify installation
python -c "import vllm; print(vllm.__version__)"
```

---

## Step 4: Download a Model

**Recommended models for RTX 3060 (12GB VRAM):**

| Model | VRAM | Best For | Download Command |
|-------|------|----------|------------------|
| **Llama 3.1 8B Instruct** | ~8GB | General coding, fast inference | `huggingface-cli download meta-llama/Llama-3.1-8B-Instruct` |
| **Qwen2.5-Coder 7B** | ~7GB | Code-specific tasks | `huggingface-cli download Qwen/Qwen2.5-Coder-7B-Instruct` |
| **CodeLlama 7B** | ~7GB | Legacy code tasks | `huggingface-cli download codellama/CodeLlama-7b-Instruct-hf` |

### Download Example (Llama 3.1 8B):

```bash
# Install HuggingFace CLI
pip install huggingface-hub

# Login to HuggingFace (required for gated models)
huggingface-cli login

# Download model (stores in ~/.cache/huggingface/)
huggingface-cli download meta-llama/Llama-3.1-8B-Instruct
```

---

## Step 5: Start vLLM Server

Create a startup script `~/start-vllm.sh`:

```bash
#!/bin/bash

# Activate vLLM environment
source ~/Applit-ai-Agent/vllm-venv/bin/activate

# Set GPU device (for RTX 3060)
export CUDA_VISIBLE_DEVICES=0

# Start vLLM server
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3.1-8B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --tensor-parallel-size 1 \
  --gpu-memory-utilization 0.85 \
  --max-model-len 4096 \
  --trust-remote-code
```

Make it executable and run:

```bash
chmod +x ~/start-vllm.sh
~/start-vllm.sh
```

**Expected Output:**
```
INFO:     Started server process [xxxxx]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000
```

---

## Step 6: Configure Applit Environment

Update `~/Applit-ai-Agent/.env`:

```bash
# Existing config
DEPLOYMENT_ENV=local

# GPU Configuration
CUDA_VISIBLE_DEVICES=0

# AI Provider Configuration
AI_PROVIDER=hybrid

# vLLM Configuration
VLLM_API_BASE=http://localhost:8000/v1
VLLM_MODEL_NAME=meta-llama/Llama-3.1-8B-Instruct

# OpenAI API Key (for fallback/critical tasks)
OPENAI_API_KEY=sk-your-openai-key-here
```

---

## Step 7: Test vLLM Server

```bash
# Test health endpoint
curl http://localhost:8000/health

# Test chat completion
curl http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "meta-llama/Llama-3.1-8B-Instruct",
    "messages": [{"role": "user", "content": "Write a Python function to calculate factorial"}],
    "max_tokens": 200
  }'
```

---

## Step 8: Run Applit with Hybrid Mode

```bash
# Navigate to project
cd ~/Applit-ai-Agent

# Start Applit (will use vLLM + OpenAI hybrid)
npm run dev
```

**Verify in logs:**
```
[Environment] AI Provider: hybrid
[AI Client] Using vLLM at http://localhost:8000/v1
[DevServer] Started vite server for default-workspace on port 3000
```

---

## Step 9: Create systemd Service (Optional - Auto-start)

Create `/etc/systemd/system/vllm.service`:

```ini
[Unit]
Description=vLLM OpenAI API Server
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/home/YOUR_USERNAME/Applit-ai-Agent
Environment="CUDA_VISIBLE_DEVICES=0"
ExecStart=/home/YOUR_USERNAME/Applit-ai-Agent/vllm-venv/bin/python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-3.1-8B-Instruct --host 0.0.0.0 --port 8000 --tensor-parallel-size 1 --gpu-memory-utilization 0.85
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable vllm
sudo systemctl start vllm
sudo systemctl status vllm
```

---

## Troubleshooting

### Issue: "Out of Memory" Error

**Solution:** Reduce GPU memory utilization or use a smaller model:

```bash
# Reduce memory usage
--gpu-memory-utilization 0.75

# Or use smaller model
--model Qwen/Qwen2.5-Coder-7B-Instruct
```

### Issue: vLLM not starting

**Check CUDA:**
```bash
nvidia-smi
python -c "import torch; print(torch.cuda.is_available())"
```

### Issue: Model download fails

**Solution:** Ensure HuggingFace authentication:
```bash
huggingface-cli login
# Enter your token from https://huggingface.co/settings/tokens
```

### Issue: Applit still using OpenAI only

**Check environment:**
```bash
# In Applit logs, you should see:
[Environment] AI Provider: hybrid
[AI Client] Using vLLM at http://localhost:8000/v1
```

If not, verify `.env` file has:
- `AI_PROVIDER=hybrid`
- `VLLM_API_BASE=http://localhost:8000/v1`

---

## Performance Tips

1. **RTX 3060 Optimization:**
   - Use 8B parameter models (7B-8B range)
   - Set `--gpu-memory-utilization 0.85`
   - Limit context length: `--max-model-len 4096`

2. **Speed vs Quality:**
   - Fast inference: Llama 3.1 8B
   - Best coding: Qwen2.5-Coder 7B
   - Balanced: CodeLlama 7B

3. **Hybrid Mode Strategy:**
   - vLLM: Planning, testing, simple queries
   - OpenAI GPT-4: Complex code generation, refactoring

---

## Next Steps

✅ vLLM is running  
✅ Applit configured for hybrid mode  
✅ Create a React app and watch it use local GPU!  

**Monitor GPU usage:**
```bash
watch -n 1 nvidia-smi
```

**View vLLM logs:**
```bash
sudo journalctl -u vllm -f
```

Enjoy fast, cost-effective AI inference! 🚀
