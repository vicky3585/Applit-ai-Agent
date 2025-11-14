import { Octokit } from '@octokit/rest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = [], basePath: string = dirPath): string[] {
  const files = readdirSync(dirPath);

  const excludeDirs = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.next',
    'venv',
    '__pycache__',
    '.vscode',
    '.idea',
    'tmp',
    '.replit',
    'replit.nix',
    '.config',
    'attached_assets', // Exclude user-uploaded assets
  ];

  const excludeFiles = [
    '.env',
    '.env.local',
    '.DS_Store',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    '.upm',
    '.breakpoints'
  ];

  // Only include source code, config, and documentation
  const includeExtensions = [
    '.ts', '.tsx', '.js', '.jsx',
    '.py', '.sql', '.md', '.json',
    '.css', '.html', '.sh', '.conf',
    '.txt', '.gitignore', 'Dockerfile',
    '.toml', '.yaml', '.yml'
  ];

  files.forEach(file => {
    const filePath = join(dirPath, file);
    const relativePath = relative(basePath, filePath);

    if (excludeDirs.some(dir => relativePath.includes(dir) || relativePath.startsWith(dir))) {
      return;
    }
    if (excludeFiles.includes(file)) {
      return;
    }

    if (statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles, basePath);
    } else {
      // Only include files with allowed extensions or no extension (like Dockerfile)
      const hasAllowedExtension = includeExtensions.some(ext => file.endsWith(ext) || file === ext);
      if (hasAllowedExtension) {
        arrayOfFiles.push(filePath);
      }
    }
  });

  return arrayOfFiles;
}

async function initializeEmptyRepo(octokit: Octokit, owner: string, repo: string) {
  console.log('📝 Initializing empty repository with README...');
  
  const readmeContent = `# Applit - AI-Powered Web IDE

**Flying Venture System**

A complete local Replit Core clone for Ubuntu 24.04 with NVIDIA RTX 3060 GPU support.

## Overview
Applit is an AI-powered Web IDE designed to facilitate full "prompt-to-app" workflows. Users describe applications in natural language, and the system automates planning, coding, testing, and deployment with live preview in a split-screen code editor.

## Features
- 🤖 **Autonomous AI Agent Workflow** - Single-prompt app generation
- 📦 **Auto Package Installation** - Detects and installs missing dependencies
- 🔧 **Auto Dev Server Spawning** - Automatic server detection and startup
- 🐳 **Docker Code Sandbox** - Isolated multi-language execution
- 💾 **PostgreSQL Persistence** - Full data persistence and rollback support
- 🚀 **Static App Deployments** - One-click deployment system
- 🔄 **Real-time Collaboration** - Yjs-powered multiplayer editing
- 📊 **Beautiful Progress UI** - Visual workflow timeline

## Quick Start

### Ubuntu 24.04 Setup

\`\`\`bash
# Clone repository
git clone https://github.com/${owner}/${repo}.git
cd ${repo}

# Run automated setup script
bash scripts/ubuntu-setup.sh

# Add your OpenAI API key
nano .env
# Set: OPENAI_API_KEY=sk-your-key-here

# Start application
source venv/bin/activate
npm run dev

# Access at http://localhost:5000
\`\`\`

## Documentation
- [Ubuntu Deployment Guide](docs/UBUNTU_DEPLOYMENT_GUIDE.md)
- [Deployment System Guide](docs/DEPLOYMENT_GUIDE.md)
- [Project Architecture](replit.md)

## Tech Stack
- **Frontend:** React 18, TypeScript, Vite, Shadcn/ui, Monaco Editor
- **Backend:** Express.js, Node.js 20, Python 3.11+
- **Database:** PostgreSQL 16, Drizzle ORM
- **AI:** OpenAI GPT-4, Multi-agent orchestration
- **Infrastructure:** Docker, Nginx, WebSockets

## Requirements
- Ubuntu 24.04 LTS
- Node.js 20.x
- Python 3.11+
- PostgreSQL 16
- Docker & Docker Compose
- NVIDIA RTX 3060 GPU (optional, for future AI features)

## License
MIT License - See LICENSE file for details

## Support
For issues or questions, please open an issue on GitHub.

---
**Built with ❤️ by Flying Venture System**
`;

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'README.md',
    message: 'Initialize repository with README',
    content: Buffer.from(readmeContent).toString('base64'),
  });
  
  console.log('✓ Repository initialized with README\n');
  
  // Wait a bit for GitHub to process
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function main() {
  const owner = 'vicky3585';
  const repo = 'Applit-ai-Agent';
  const branch = 'main';
  const commitMessage = 'Add complete Applit AI IDE project';
  const BATCH_SIZE = 800; // Upload blobs in batches to avoid timeouts

  console.log('🚀 Starting GitHub push process...\n');

  try {
    const octokit = await getUncachableGitHubClient();
    console.log('✓ Authenticated with GitHub\n');

    console.log(`📦 Checking repository: ${owner}/${repo}...`);
    await octokit.repos.get({ owner, repo });
    console.log('✓ Repository found\n');

    // Check if repository is empty
    let baseCommitSha: string | undefined;
    let isRepoEmpty = false;
    
    try {
      const { data: refData } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      baseCommitSha = refData.object.sha;
      console.log('✓ Found existing commits\n');
    } catch (error: any) {
      if (error.status === 409 || error.status === 404) {
        isRepoEmpty = true;
      } else {
        throw error;
      }
    }

    // Initialize if empty
    if (isRepoEmpty) {
      await initializeEmptyRepo(octokit, owner, repo);
      
      // Get the new base commit
      const { data: refData } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      baseCommitSha = refData.object.sha;
    }

    const { data: baseCommit } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: baseCommitSha!,
    });

    // Get all files
    console.log('📂 Collecting project files...');
    const projectRoot = process.cwd();
    const allFiles = getAllFiles(projectRoot).filter(f => !f.endsWith('README.md')); // Skip README, already exists
    console.log(`✓ Found ${allFiles.length} files to upload\n`);

    // Upload blobs in batches
    console.log('📤 Uploading files to GitHub...');
    const blobs: Array<{ path: string; sha: string; mode: '100644' | '100755' }> = [];
    
    for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
      const batch = allFiles.slice(i, Math.min(i + BATCH_SIZE, allFiles.length));
      console.log(`  Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allFiles.length / BATCH_SIZE)} (${batch.length} files)...`);
      
      for (const filePath of batch) {
        const relativePath = relative(projectRoot, filePath);
        const content = readFileSync(filePath);
        const stats = statSync(filePath);
        const mode = (stats.mode & 0o111) ? '100755' : '100644';
        
        const { data: blob } = await octokit.git.createBlob({
          owner,
          repo,
          content: content.toString('base64'),
          encoding: 'base64',
        });
        
        blobs.push({
          path: relativePath,
          sha: blob.sha,
          mode: mode as '100644' | '100755',
        });
      }
      
      console.log(`  ✓ Uploaded ${Math.min(i + BATCH_SIZE, allFiles.length)}/${allFiles.length} files`);
    }
    console.log(`✓ All ${allFiles.length} files uploaded\n`);

    // Create tree
    console.log('🌳 Creating git tree...');
    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      tree: blobs.map(blob => ({
        path: blob.path,
        mode: blob.mode,
        type: 'blob' as const,
        sha: blob.sha,
      })),
      base_tree: baseCommit.tree.sha,
    });
    console.log('✓ Tree created\n');

    // Create commit
    console.log('💾 Creating commit...');
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [baseCommitSha!],
    });
    console.log('✓ Commit created\n');

    // Update reference
    console.log(`📌 Updating ${branch} branch...`);
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });
    console.log('✓ Branch updated\n');

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 SUCCESS! Project pushed to GitHub!');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`\n📍 Repository: https://github.com/${owner}/${repo}`);
    console.log(`📝 Commit: ${commitMessage}`);
    console.log(`📊 Files: ${allFiles.length}`);
    console.log(`\n🖥️  Clone on Ubuntu:`);
    console.log(`   git clone https://github.com/${owner}/${repo}.git`);
    console.log(`   cd ${repo}`);
    console.log(`   bash scripts/ubuntu-setup.sh\n`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    if (error.status) {
      console.error('Status:', error.status);
    }
    process.exit(1);
  }
}

main();
