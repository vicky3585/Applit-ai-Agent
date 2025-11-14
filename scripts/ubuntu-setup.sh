#!/bin/bash

# Applit Ubuntu 24.04 Setup Script
# This script automates the installation of dependencies and configuration
# Run with: bash scripts/ubuntu-setup.sh

set -e  # Exit on error

echo "=========================================="
echo "Applit Ubuntu 24.04 Setup Script"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo -e "${RED}Error: Please do not run this script as root${NC}"
   echo "Run as regular user: bash scripts/ubuntu-setup.sh"
   exit 1
fi

# Function to print status
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Step 1: Update system
echo "Step 1: Updating system packages..."
sudo apt update
sudo apt upgrade -y
print_status "System updated"

# Step 2: Install Node.js 20.x
echo ""
echo "Step 2: Installing Node.js 20.x..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
    print_status "Node.js installed: $(node --version)"
else
    print_warning "Node.js already installed: $(node --version)"
fi

# Step 3: Install Python 3.11+
echo ""
echo "Step 3: Installing Python..."
sudo apt install -y python3 python3-pip python3-venv python3-dev
print_status "Python installed: $(python3 --version)"

# Step 4: Install PostgreSQL 16
echo ""
echo "Step 4: Installing PostgreSQL..."
if ! command -v psql &> /dev/null; then
    sudo apt install -y postgresql postgresql-contrib libpq-dev
    sudo systemctl start postgresql
    sudo systemctl enable postgresql
    print_status "PostgreSQL installed"
else
    print_warning "PostgreSQL already installed"
fi

# Step 5: Install Docker
echo ""
echo "Step 5: Installing Docker..."
if ! command -v docker &> /dev/null; then
    sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    sudo usermod -aG docker $USER
    print_status "Docker installed"
    print_warning "You need to log out and log back in for Docker permissions to take effect"
else
    print_warning "Docker already installed: $(docker --version)"
fi

# Step 6: Install Nginx
echo ""
echo "Step 6: Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    sudo apt install -y nginx
    print_status "Nginx installed"
else
    print_warning "Nginx already installed: $(nginx -v 2>&1)"
fi

# Step 7: Install build tools
echo ""
echo "Step 7: Installing build tools..."
sudo apt install -y build-essential git curl
print_status "Build tools installed"

# Step 8: Create database
echo ""
echo "Step 8: Setting up PostgreSQL database..."
echo ""
echo "Creating database and user..."
echo "Please enter a secure password for the database user:"
read -s DB_PASSWORD

sudo -u postgres psql <<EOF
-- Drop existing database if it exists
DROP DATABASE IF EXISTS applit_db;
DROP USER IF EXISTS applit_user;

-- Create database and user
CREATE DATABASE applit_db;
CREATE USER applit_user WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE applit_db TO applit_user;
\c applit_db
GRANT ALL ON SCHEMA public TO applit_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO applit_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO applit_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO applit_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO applit_user;
EOF

print_status "Database created: applit_db"

# Configure PostgreSQL for password authentication
sudo sed -i 's/local   all             all                                     peer/local   all             all                                     md5/g' /etc/postgresql/16/main/pg_hba.conf
sudo systemctl restart postgresql
print_status "PostgreSQL configured for password authentication"

# Step 9: Create .env file
echo ""
echo "Step 9: Creating .env file..."
if [ ! -f .env ]; then
    cat > .env <<EOF
# Database Configuration
DATABASE_URL=postgresql://applit_user:$DB_PASSWORD@localhost:5432/applit_db
PGHOST=localhost
PGPORT=5432
PGDATABASE=applit_db
PGUSER=applit_user
PGPASSWORD=$DB_PASSWORD

# OpenAI API Key (get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Session Secret
SESSION_SECRET=$(openssl rand -base64 32)

# Environment
NODE_ENV=development

# Port Configuration
PORT=5000
VITE_PORT=5173

# Security Settings
MAX_SESSIONS_PER_USER=5

# Docker
DOCKER_ENABLED=true
EOF
    print_status ".env file created"
    print_warning "IMPORTANT: Edit .env and add your OPENAI_API_KEY"
else
    print_warning ".env file already exists, skipping..."
fi

# Step 10: Install Node.js dependencies
echo ""
echo "Step 10: Installing Node.js dependencies..."
npm install
print_status "Node.js dependencies installed"

# Step 11: Set up Python virtual environment
echo ""
echo "Step 11: Setting up Python virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    print_status "Python virtual environment created and dependencies installed"
else
    print_warning "Python virtual environment already exists"
fi

# Step 12: Initialize database schema
echo ""
echo "Step 12: Initializing database schema..."
npm run db:push
print_status "Database schema initialized"

# Step 13: Configure Nginx
echo ""
echo "Step 13: Configuring Nginx for deployments..."
if [ -f "docs/nginx-templates/ai-ide-apps.conf" ]; then
    sudo cp docs/nginx-templates/ai-ide-apps.conf /etc/nginx/sites-available/
    sudo ln -sf /etc/nginx/sites-available/ai-ide-apps.conf /etc/nginx/sites-enabled/
    sudo mkdir -p /var/www/ai-ide
    sudo chown -R www-data:www-data /var/www/ai-ide
    sudo chmod 755 /var/www/ai-ide
    sudo nginx -t && sudo systemctl reload nginx
    print_status "Nginx configured for static deployments"
else
    print_warning "Nginx template not found, skipping..."
fi

# Step 14: Pull Docker images
echo ""
echo "Step 14: Pulling Docker images for code execution..."
if command -v docker &> /dev/null; then
    docker pull node:20-alpine
    docker pull python:3.11-slim
    print_status "Docker images pulled"
else
    print_warning "Docker not available, skipping image pull"
fi

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Edit .env and add your OPENAI_API_KEY"
echo "2. Log out and log back in (for Docker permissions)"
echo "3. Start the application:"
echo "   cd $(pwd)"
echo "   source venv/bin/activate"
echo "   npm run dev"
echo ""
echo "4. Access the application at: http://localhost:5000"
echo ""
echo "For detailed documentation, see:"
echo "  - docs/UBUNTU_DEPLOYMENT_GUIDE.md"
echo "  - replit.md"
echo ""
