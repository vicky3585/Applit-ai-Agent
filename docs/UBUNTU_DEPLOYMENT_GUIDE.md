# Applit - Complete Ubuntu 24.04 Deployment Guide

## Overview
This guide will walk you through moving Applit from Replit to your Ubuntu 24.04 machine with NVIDIA RTX 3060 GPU. We'll set up the complete development environment, configure PostgreSQL, and get the application running.

---

## Prerequisites

### System Requirements
- Ubuntu 24.04 LTS
- NVIDIA RTX 3060 GPU (for future AI features)
- Minimum 8GB RAM
- 20GB free disk space
- Sudo access

### Required Software
- Node.js 20.x
- Python 3.11+
- PostgreSQL 16
- Docker & Docker Compose
- Nginx
- Git

---

## Step 1: Clone/Download Project from Replit

### Option A: Using Git (Recommended)

```bash
# On your Ubuntu machine
cd ~
mkdir -p projects
cd projects

# If you have Git integration set up in Replit
git clone <your-replit-git-url> applit
cd applit
```

### Option B: Download as ZIP

```bash
# On Replit:
# 1. Click "..." menu
# 2. Select "Download as zip"
# 3. Transfer to Ubuntu machine

# On Ubuntu:
cd ~/projects
unzip applit.zip
cd applit
```

### Option C: Manual File Transfer

```bash
# Use scp from your local machine
scp -r /path/to/replit/workspace user@ubuntu-ip:~/projects/applit

# Or use rsync for faster transfer
rsync -avz --progress /path/to/replit/workspace/ user@ubuntu-ip:~/projects/applit/
```

---

## Step 2: Install System Dependencies

### Update System
```bash
sudo apt update
sudo apt upgrade -y
```

### Install Node.js 20.x
```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### Install Python 3.11+
```bash
# Ubuntu 24.04 comes with Python 3.12 by default
python3 --version

# Install pip and venv
sudo apt install -y python3-pip python3-venv

# Verify
python3 --version  # Should show 3.11 or higher
pip3 --version
```

### Install PostgreSQL 16
```bash
# Install PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
sudo -u postgres psql --version  # Should show 16.x
```

### Install Docker & Docker Compose
```bash
# Install Docker
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify Docker installation
docker --version
docker compose version
```

### Install Nginx
```bash
sudo apt install -y nginx

# Verify installation
nginx -v
sudo systemctl status nginx
```

### Install Git (if not already installed)
```bash
sudo apt install -y git
git --version
```

### Install Build Tools
```bash
# Essential build tools
sudo apt install -y build-essential

# For Python packages
sudo apt install -y python3-dev libpq-dev
```

---

## Step 3: Set Up PostgreSQL Database

### Create Database and User
```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL prompt:
CREATE DATABASE applit_db;
CREATE USER applit_user WITH ENCRYPTED PASSWORD 'your_secure_password_here';
GRANT ALL PRIVILEGES ON DATABASE applit_db TO applit_user;

# Grant schema permissions
\c applit_db
GRANT ALL ON SCHEMA public TO applit_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO applit_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO applit_user;

# Exit PostgreSQL
\q
```

### Configure PostgreSQL for Local Access
```bash
# Edit pg_hba.conf to allow password authentication
sudo nano /etc/postgresql/16/main/pg_hba.conf

# Find the line:
# local   all             all                                     peer

# Change to:
# local   all             all                                     md5

# Save and exit (Ctrl+X, Y, Enter)

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Test Database Connection
```bash
# Test connection
psql -U applit_user -d applit_db -h localhost -W

# You should be prompted for password
# If successful, you'll see: applit_db=>

# Exit with \q
```

---

## Step 4: Configure Environment Variables

### Create .env File
```bash
cd ~/projects/applit

# Create .env file
nano .env
```

### Add Environment Variables
```bash
# Database Configuration
DATABASE_URL=postgresql://applit_user:your_secure_password_here@localhost:5432/applit_db
PGHOST=localhost
PGPORT=5432
PGDATABASE=applit_db
PGUSER=applit_user
PGPASSWORD=your_secure_password_here

# OpenAI API Key (get from https://platform.openai.com/api-keys)
OPENAI_API_KEY=sk-your-openai-api-key-here

# Session Secret (generate with: openssl rand -base64 32)
SESSION_SECRET=your-random-session-secret-here

# Environment
NODE_ENV=production

# Port Configuration
PORT=5000
VITE_PORT=5173

# Security Settings
MAX_SESSIONS_PER_USER=5

# Docker (if using Docker sandbox)
DOCKER_ENABLED=true
```

**Security Note:** Never commit `.env` to Git! It should already be in `.gitignore`.

### Generate Secure Session Secret
```bash
# Generate a random session secret
openssl rand -base64 32

# Copy the output and paste it as SESSION_SECRET in .env
```

---

## Step 5: Install Node.js Dependencies

```bash
cd ~/projects/applit

# Install dependencies
npm install

# This will install all packages from package.json
# Wait for installation to complete (may take 2-5 minutes)
```

### Verify Installation
```bash
# Check for node_modules directory
ls -la | grep node_modules

# Verify key packages
npm list drizzle-orm express react vite
```

---

## Step 6: Install Python Dependencies

```bash
cd ~/projects/applit

# Create Python virtual environment
python3 -m venv venv

# Activate virtual environment
source venv/bin/activate

# Install Python packages
pip install -r requirements.txt

# Verify installation
pip list
```

**Note:** Keep the virtual environment activated for the next steps.

---

## Step 7: Initialize Database Schema

### Push Database Schema
```bash
cd ~/projects/applit

# Push schema to PostgreSQL
npm run db:push

# You should see:
# ✓ Pulling schema from database...
# ✓ Changes applied
```

### Verify Database Tables
```bash
# Connect to database
psql -U applit_user -d applit_db -h localhost -W

# List all tables
\dt

# You should see tables like:
# - users
# - sessions
# - workspaces
# - files
# - chat_messages
# - agent_executions
# - packages
# - code_executions
# - deployments
# - yjs_documents
# etc.

# Exit
\q
```

---

## Step 8: Set Up Docker for Code Sandbox

### Start Docker Service
```bash
# Ensure Docker is running
sudo systemctl start docker
sudo systemctl enable docker

# Verify
docker ps
```

### Pull Required Docker Images
```bash
# Pull base images for code execution
docker pull node:20-alpine
docker pull python:3.11-slim
```

### Test Docker Access
```bash
# Test Docker without sudo
docker run hello-world

# If you get permission denied, run:
sudo usermod -aG docker $USER
newgrp docker
```

---

## Step 9: Configure Nginx for Static Deployments

### Copy Nginx Configuration
```bash
sudo cp ~/projects/applit/docs/nginx-templates/ai-ide-apps.conf /etc/nginx/sites-available/

# Create symlink to enable
sudo ln -s /etc/nginx/sites-available/ai-ide-apps.conf /etc/nginx/sites-enabled/

# Test nginx configuration
sudo nginx -t

# If test passes, reload nginx
sudo systemctl reload nginx
```

### Create Deployment Directory
```bash
# Create directory for deployed apps
sudo mkdir -p /var/www/ai-ide

# Set ownership to www-data (nginx user)
sudo chown -R www-data:www-data /var/www/ai-ide

# Set permissions
sudo chmod 755 /var/www/ai-ide
```

---

## Step 10: Run the Application

### Terminal 1: Start the Backend Server

```bash
cd ~/projects/applit

# Ensure .env is configured
# Ensure Python venv is activated
source venv/bin/activate

# Start the application
npm run dev

# You should see:
# [Server] Starting on http://0.0.0.0:5000
# [Storage] Using PostgresStorage (DATABASE_URL detected)
# [PostgresStorage] Connected successfully
# [Workspace] Loading default workspace...
```

### Access the Application

Open your browser and navigate to:
```
http://localhost:5000
```

Or from another machine on the network:
```
http://<ubuntu-machine-ip>:5000
```

---

## Step 11: Testing the Deployment

### Test Basic Functionality

1. **File Explorer:**
   - Create a new file
   - Edit and save
   - Verify file persistence

2. **Code Editor:**
   - Write some code
   - Test Monaco editor functionality
   - Check syntax highlighting

3. **AI Agent:**
   - Send a prompt in chat
   - Watch agent workflow (Planning → Coding → Testing)
   - Verify files are generated
   - Check package auto-installation

4. **Code Execution:**
   - Run JavaScript code
   - Run Python code
   - Check Docker container creation

5. **Live Preview:**
   - Create an HTML file
   - Verify hot reload works
   - Check dev server spawning

### Test Database Persistence

```bash
# Stop the server (Ctrl+C)
# Restart the server
npm run dev

# Verify:
# - Files are still there
# - Chat history is preserved
# - Workspaces are intact
```

### Test Deployment System

```bash
# Create a simple Vite app in a workspace
# Then test deployment API:

curl -X POST http://localhost:5000/api/workspaces/<workspace-id>/deploy \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"buildCommand": "npm run build"}'

# Check deployment status
curl http://localhost:5000/api/workspaces/<workspace-id>/deployments \
  -H "Authorization: Bearer <jwt-token>"
```

---

## Step 12: Set Up as a System Service (Optional)

### Create Systemd Service

```bash
sudo nano /etc/systemd/system/applit.service
```

Add the following:
```ini
[Unit]
Description=Applit AI-Powered IDE
After=network.target postgresql.service

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/projects/applit
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

### Enable and Start Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable applit

# Start service
sudo systemctl start applit

# Check status
sudo systemctl status applit

# View logs
sudo journalctl -u applit -f
```

---

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 5000
sudo lsof -i :5000

# Kill process if needed
sudo kill -9 <PID>
```

### Database Connection Issues
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Check PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-16-main.log

# Verify DATABASE_URL in .env
cat .env | grep DATABASE_URL
```

### Docker Permission Issues
```bash
# Add user to docker group
sudo usermod -aG docker $USER

# Log out and log back in, or run:
newgrp docker
```

### Python Virtual Environment Issues
```bash
# Recreate virtual environment
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Node Modules Issues
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Schema Migration Issues
```bash
# Force push schema (WARNING: May lose data)
npm run db:push -- --force

# Or manually connect and drop tables
psql -U applit_user -d applit_db -h localhost -W
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO applit_user;
\q

# Then push schema again
npm run db:push
```

---

## Performance Optimization

### Enable Nginx Caching
```bash
sudo nano /etc/nginx/nginx.conf

# Add to http block:
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m max_size=1g inactive=60m use_temp_path=off;
```

### Enable Firewall (UFW)
```bash
# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow application port
sudo ufw allow 5000/tcp

# Enable firewall
sudo ufw enable
```

### Monitor Resources
```bash
# Install htop
sudo apt install -y htop

# Monitor in real-time
htop

# Check disk usage
df -h

# Check database size
sudo -u postgres psql -c "SELECT pg_database.datname, pg_database_size(pg_database.datname), pg_size_pretty(pg_database_size(pg_database.datname)) FROM pg_database;"
```

---

## Security Checklist

- [ ] Change default PostgreSQL password
- [ ] Generate strong SESSION_SECRET
- [ ] Keep OPENAI_API_KEY secure
- [ ] Never commit .env to Git
- [ ] Enable firewall (UFW)
- [ ] Keep system updated (`sudo apt update && sudo apt upgrade`)
- [ ] Use HTTPS in production (Let's Encrypt)
- [ ] Restrict PostgreSQL to localhost only
- [ ] Set up regular database backups
- [ ] Monitor logs for suspicious activity

---

## Backup and Recovery

### Backup Database
```bash
# Create backup
pg_dump -U applit_user -h localhost -d applit_db -F c -f backup_$(date +%Y%m%d_%H%M%S).dump

# Compress backup
gzip backup_*.dump
```

### Restore Database
```bash
# Restore from backup
pg_restore -U applit_user -h localhost -d applit_db -F c backup_20250114_120000.dump
```

### Backup Files
```bash
# Backup entire project
tar -czf applit_backup_$(date +%Y%m%d).tar.gz ~/projects/applit

# Exclude node_modules and venv
tar --exclude='node_modules' --exclude='venv' --exclude='.git' -czf applit_backup_$(date +%Y%m%d).tar.gz ~/projects/applit
```

---

## Next Steps

1. **Set up HTTPS** with Let's Encrypt for production
2. **Configure reverse proxy** with Nginx for better security
3. **Implement CI/CD** pipeline for automated deployments
4. **Set up monitoring** with PM2 or systemd
5. **Configure log rotation** to prevent disk fill-up
6. **Test GPU acceleration** for AI features (NVIDIA RTX 3060)

---

## Useful Commands Reference

```bash
# Start application
npm run dev

# Stop application
Ctrl+C

# View logs
tail -f ~/.pm2/logs/applit-out.log  # If using PM2
sudo journalctl -u applit -f        # If using systemd

# Database operations
npm run db:push                      # Push schema
psql -U applit_user -d applit_db    # Connect to database

# Docker operations
docker ps                            # List running containers
docker logs <container-id>           # View container logs
docker system prune                  # Clean up unused containers

# Nginx operations
sudo nginx -t                        # Test config
sudo systemctl reload nginx          # Reload config
sudo tail -f /var/log/nginx/error.log  # View errors
```

---

## Support and Resources

- **Project Documentation:** `./replit.md`
- **Deployment Guide:** `./docs/DEPLOYMENT_GUIDE.md`
- **PostgreSQL Docs:** https://www.postgresql.org/docs/16/
- **Nginx Docs:** https://nginx.org/en/docs/
- **Docker Docs:** https://docs.docker.com/

---

**Last Updated:** January 14, 2025
**For:** Ubuntu 24.04 LTS + NVIDIA RTX 3060
