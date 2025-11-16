#!/bin/bash

# vLLM Setup Script for Ubuntu with NVIDIA GPU
# This script sets up vLLM for local GPU inference with Applit

set -e

echo "🚀 Applit vLLM Setup Script"
echo "============================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if running on Ubuntu
if [[ ! -f /etc/lsb-release ]]; then
    echo -e "${RED}❌ This script is designed for Ubuntu. Exiting.${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Detected Ubuntu system"

# Check for NVIDIA GPU
if ! command -v nvidia-smi &> /dev/null; then
    echo -e "${RED}❌ nvidia-smi not found. Please install NVIDIA drivers first.${NC}"
    echo "Visit: https://www.nvidia.com/Download/index.aspx"
    exit 1
fi

echo -e "${GREEN}✓${NC} NVIDIA GPU detected:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader

# Check CUDA
if ! command -v nvcc &> /dev/null; then
    echo -e "${YELLOW}⚠${NC}  CUDA toolkit not found in PATH"
    echo "Installing CUDA is recommended but not required for vLLM"
    read -p "Continue without CUDA toolkit? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✓${NC} CUDA detected: $(nvcc --version | grep release | awk '{print $5}' | tr -d ',')"
fi

# Get project directory
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo -e "${GREEN}✓${NC} Project directory: $PROJECT_DIR"

# Create vLLM virtual environment
VLLM_VENV="$PROJECT_DIR/vllm-venv"

if [ -d "$VLLM_VENV" ]; then
    echo -e "${YELLOW}⚠${NC}  vLLM virtual environment already exists at $VLLM_VENV"
    read -p "Recreate it? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$VLLM_VENV"
    else
        echo "Using existing virtual environment"
    fi
fi

if [ ! -d "$VLLM_VENV" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$VLLM_VENV"
    echo -e "${GREEN}✓${NC} Virtual environment created"
fi

# Activate virtual environment
source "$VLLM_VENV/bin/activate"

# Upgrade pip
echo "Upgrading pip..."
pip install --upgrade pip --quiet

# Install vLLM
echo "Installing vLLM (this may take a few minutes)..."
pip install vllm --quiet
echo -e "${GREEN}✓${NC} vLLM installed"

# Install HuggingFace CLI
echo "Installing HuggingFace CLI..."
pip install huggingface-hub --quiet
echo -e "${GREEN}✓${NC} HuggingFace CLI installed"

# Ask user to choose model
echo ""
echo "Select a model to download:"
echo "1) Llama 3.1 8B Instruct (Recommended, ~8GB VRAM)"
echo "2) Qwen2.5-Coder 7B Instruct (Best for coding, ~7GB VRAM)"
echo "3) CodeLlama 7B Instruct (Legacy, ~7GB VRAM)"
echo "4) Skip model download (I'll do it manually)"
read -p "Enter choice (1-4): " model_choice

case $model_choice in
    1)
        MODEL_NAME="meta-llama/Llama-3.1-8B-Instruct"
        ;;
    2)
        MODEL_NAME="Qwen/Qwen2.5-Coder-7B-Instruct"
        ;;
    3)
        MODEL_NAME="codellama/CodeLlama-7b-Instruct-hf"
        ;;
    4)
        echo "Skipping model download"
        MODEL_NAME=""
        ;;
    *)
        echo -e "${RED}Invalid choice. Exiting.${NC}"
        exit 1
        ;;
esac

if [ -n "$MODEL_NAME" ]; then
    echo ""
    echo "Downloading model: $MODEL_NAME"
    echo "This may take several minutes depending on your internet speed..."
    
    # Check if user is logged in to HuggingFace
    if ! huggingface-cli whoami &> /dev/null; then
        echo -e "${YELLOW}⚠${NC}  You need to login to HuggingFace to download models"
        echo "Visit https://huggingface.co/settings/tokens to get your token"
        huggingface-cli login
    fi
    
    huggingface-cli download "$MODEL_NAME"
    echo -e "${GREEN}✓${NC} Model downloaded successfully"
fi

# Create startup script
STARTUP_SCRIPT="$PROJECT_DIR/start-vllm.sh"
cat > "$STARTUP_SCRIPT" << EOF
#!/bin/bash
# Auto-generated vLLM startup script

# Activate vLLM environment
source "$VLLM_VENV/bin/activate"

# Set GPU device
export CUDA_VISIBLE_DEVICES=0

# Start vLLM server
python -m vllm.entrypoints.openai.api_server \\
  --model ${MODEL_NAME:-meta-llama/Llama-3.1-8B-Instruct} \\
  --host 0.0.0.0 \\
  --port 8000 \\
  --tensor-parallel-size 1 \\
  --gpu-memory-utilization 0.85 \\
  --max-model-len 4096 \\
  --trust-remote-code
EOF

chmod +x "$STARTUP_SCRIPT"
echo -e "${GREEN}✓${NC} Created startup script: $STARTUP_SCRIPT"

# Update .env file
ENV_FILE="$PROJECT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
    cp "$PROJECT_DIR/.env.example" "$ENV_FILE"
    echo -e "${GREEN}✓${NC} Created .env from .env.example"
fi

# Check if vLLM config exists in .env
if ! grep -q "VLLM_API_BASE" "$ENV_FILE"; then
    echo "" >> "$ENV_FILE"
    echo "# vLLM Configuration (added by setup script)" >> "$ENV_FILE"
    echo "VLLM_API_BASE=http://localhost:8000/v1" >> "$ENV_FILE"
    echo "VLLM_MODEL_NAME=${MODEL_NAME:-meta-llama/Llama-3.1-8B-Instruct}" >> "$ENV_FILE"
    echo "CUDA_VISIBLE_DEVICES=0" >> "$ENV_FILE"
    echo "AI_PROVIDER=hybrid" >> "$ENV_FILE"
    echo -e "${GREEN}✓${NC} Updated .env with vLLM configuration"
else
    echo -e "${YELLOW}⚠${NC}  vLLM configuration already exists in .env (not modified)"
fi

echo ""
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Start vLLM server:"
echo "   ${STARTUP_SCRIPT}"
echo ""
echo "2. In a new terminal, start Applit:"
echo "   cd $PROJECT_DIR"
echo "   npm run dev"
echo ""
echo "3. Monitor GPU usage:"
echo "   watch -n 1 nvidia-smi"
echo ""
echo "For more details, see: docs/VLLM_SETUP.md"
