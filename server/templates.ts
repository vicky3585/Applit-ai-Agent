/**
 * Project Templates Configuration
 * 
 * Defines pre-built templates for popular frameworks and languages.
 * Each template includes file structure, content, and default packages.
 */

export interface TemplateFile {
  path: string;
  content: string;
  language: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: "frontend" | "backend" | "fullstack";
  language: "typescript" | "javascript" | "python";
  framework: string;
  icon: string; // Emoji or icon name
  files: TemplateFile[];
  packages?: {
    npm?: string[];
    pip?: string[];
    apt?: string[];
  };
  devCommand?: string;
  buildCommand?: string;
}

export const templates: Template[] = [
  {
    id: "react-vite-ts",
    name: "React + Vite (TypeScript)",
    description: "Modern React app with Vite build tool, TypeScript, and hot module replacement",
    category: "frontend",
    language: "typescript",
    framework: "React",
    icon: "⚛️",
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: "react-vite-app",
            version: "1.0.0",
            type: "module",
            scripts: {
              dev: "vite",
              build: "tsc && vite build",
              preview: "vite preview",
            },
            dependencies: {
              react: "^18.2.0",
              "react-dom": "^18.2.0",
            },
            devDependencies: {
              "@types/react": "^18.2.0",
              "@types/react-dom": "^18.2.0",
              "@vitejs/plugin-react": "^4.2.0",
              typescript: "^5.2.0",
              vite: "^5.0.0",
            },
          },
          null,
          2
        ),
        language: "json",
      },
      {
        path: "index.html",
        content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React + Vite App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
        language: "html",
      },
      {
        path: "src/main.tsx",
        content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
        language: "typescript",
      },
      {
        path: "src/App.tsx",
        content: `import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="app">
      <h1>React + Vite</h1>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  )
}

export default App`,
        language: "typescript",
      },
      {
        path: "src/index.css",
        content: `:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}

.app {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  cursor: pointer;
  transition: border-color 0.25s;
}

button:hover {
  border-color: #646cff;
}`,
        language: "css",
      },
      {
        path: "vite.config.ts",
        content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
})`,
        language: "typescript",
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify(
          {
            compilerOptions: {
              target: "ES2020",
              useDefineForClassFields: true,
              lib: ["ES2020", "DOM", "DOM.Iterable"],
              module: "ESNext",
              skipLibCheck: true,
              moduleResolution: "bundler",
              allowImportingTsExtensions: true,
              resolveJsonModule: true,
              isolatedModules: true,
              noEmit: true,
              jsx: "react-jsx",
              strict: true,
              noUnusedLocals: true,
              noUnusedParameters: true,
              noFallthroughCasesInSwitch: true,
            },
            include: ["src"],
          },
          null,
          2
        ),
        language: "json",
      },
      {
        path: "README.md",
        content: `# React + Vite App

This is a React application built with Vite.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

The app will be available at http://localhost:3000
`,
        language: "markdown",
      },
    ],
    packages: {
      npm: ["react", "react-dom", "vite", "@vitejs/plugin-react", "typescript"],
    },
    devCommand: "npm run dev",
    buildCommand: "npm run build",
  },
  {
    id: "vue-vite-ts",
    name: "Vue 3 + Vite (TypeScript)",
    description: "Vue 3 application with Composition API, TypeScript, and Vite",
    category: "frontend",
    language: "typescript",
    framework: "Vue",
    icon: "💚",
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: "vue-vite-app",
            version: "1.0.0",
            type: "module",
            scripts: {
              dev: "vite",
              build: "vue-tsc && vite build",
              preview: "vite preview",
            },
            dependencies: {
              vue: "^3.3.0",
            },
            devDependencies: {
              "@vitejs/plugin-vue": "^4.4.0",
              "vue-tsc": "^1.8.0",
              typescript: "^5.2.0",
              vite: "^5.0.0",
            },
          },
          null,
          2
        ),
        language: "json",
      },
      {
        path: "index.html",
        content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vue + Vite App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>`,
        language: "html",
      },
      {
        path: "src/main.ts",
        content: `import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

createApp(App).mount('#app')`,
        language: "typescript",
      },
      {
        path: "src/App.vue",
        content: `<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
</script>

<template>
  <div class="app">
    <h1>Vue 3 + Vite</h1>
    <div class="card">
      <button type="button" @click="count++">count is {{ count }}</button>
    </div>
    <p>Edit components/App.vue to test HMR</p>
  </div>
</template>

<style scoped>
.app {
  text-align: center;
}
</style>`,
        language: "vue",
      },
      {
        path: "src/style.css",
        content: `:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  cursor: pointer;
  transition: border-color 0.25s;
}

button:hover {
  border-color: #42b883;
}`,
        language: "css",
      },
      {
        path: "vite.config.ts",
        content: `import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
})`,
        language: "typescript",
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify(
          {
            compilerOptions: {
              target: "ES2020",
              useDefineForClassFields: true,
              module: "ESNext",
              lib: ["ES2020", "DOM", "DOM.Iterable"],
              skipLibCheck: true,
              moduleResolution: "bundler",
              allowImportingTsExtensions: true,
              resolveJsonModule: true,
              isolatedModules: true,
              noEmit: true,
              jsx: "preserve",
              strict: true,
              noUnusedLocals: true,
              noUnusedParameters: true,
              noFallthroughCasesInSwitch: true,
            },
            include: ["src/**/*.ts", "src/**/*.vue"],
          },
          null,
          2
        ),
        language: "json",
      },
      {
        path: "README.md",
        content: `# Vue 3 + Vite App

This is a Vue 3 application built with Vite.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

The app will be available at http://localhost:3000
`,
        language: "markdown",
      },
    ],
    packages: {
      npm: ["vue", "vite", "@vitejs/plugin-vue", "vue-tsc", "typescript"],
    },
    devCommand: "npm run dev",
    buildCommand: "npm run build",
  },
  {
    id: "express-ts",
    name: "Express (TypeScript)",
    description: "Express.js REST API with TypeScript, ESM modules, and hot reload",
    category: "backend",
    language: "typescript",
    framework: "Express",
    icon: "🚂",
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: "express-api",
            version: "1.0.0",
            type: "module",
            scripts: {
              dev: "tsx watch src/index.ts",
              build: "tsc",
              start: "node dist/index.js",
            },
            dependencies: {
              express: "^4.18.0",
              cors: "^2.8.5",
            },
            devDependencies: {
              "@types/express": "^4.17.0",
              "@types/cors": "^2.8.0",
              "@types/node": "^20.0.0",
              tsx: "^4.7.0",
              typescript: "^5.2.0",
            },
          },
          null,
          2
        ),
        language: "json",
      },
      {
        path: "src/index.ts",
        content: `import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Express API!' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(\`Server running on port \${PORT}\`);
});`,
        language: "typescript",
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify(
          {
            compilerOptions: {
              target: "ES2022",
              module: "ES2022",
              moduleResolution: "node",
              outDir: "./dist",
              rootDir: "./src",
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              forceConsistentCasingInFileNames: true,
            },
            include: ["src/**/*"],
          },
          null,
          2
        ),
        language: "json",
      },
      {
        path: "README.md",
        content: `# Express TypeScript API

A simple Express API built with TypeScript.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

The API will be available at http://localhost:3000

## Endpoints

- GET / - Welcome message
- GET /api/health - Health check
`,
        language: "markdown",
      },
    ],
    packages: {
      npm: ["express", "cors", "@types/express", "@types/cors", "@types/node", "tsx", "typescript"],
    },
    devCommand: "npm run dev",
    buildCommand: "npm run build",
  },
  {
    id: "flask-python",
    name: "Flask (Python)",
    description: "Flask REST API with blueprints, CORS, and hot reload",
    category: "backend",
    language: "python",
    framework: "Flask",
    icon: "🐍",
    files: [
      {
        path: "app.py",
        content: `from flask import Flask, jsonify
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return jsonify({"message": "Hello from Flask API!"})

@app.route('/api/health')
def health():
    return jsonify({
        "status": "ok",
        "timestamp": datetime.now().isoformat()
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)`,
        language: "python",
      },
      {
        path: "requirements.txt",
        content: `Flask==3.0.0
flask-cors==4.0.0`,
        language: "plaintext",
      },
      {
        path: "README.md",
        content: `# Flask Python API

A simple Flask API with CORS support.

## Getting Started

\`\`\`bash
pip install -r requirements.txt
python app.py
\`\`\`

The API will be available at http://localhost:3000

## Endpoints

- GET / - Welcome message
- GET /api/health - Health check
`,
        language: "markdown",
      },
    ],
    packages: {
      pip: ["Flask", "flask-cors"],
    },
    devCommand: "python app.py",
  },
  {
    id: "fastapi-python",
    name: "FastAPI (Python)",
    description: "FastAPI with automatic OpenAPI docs, async support, and type validation",
    category: "backend",
    language: "python",
    framework: "FastAPI",
    icon: "⚡",
    files: [
      {
        path: "main.py",
        content: `from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime

app = FastAPI(title="FastAPI App")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Hello from FastAPI!"}

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat()
    }`,
        language: "python",
      },
      {
        path: "requirements.txt",
        content: `fastapi==0.109.0
uvicorn[standard]==0.27.0`,
        language: "plaintext",
      },
      {
        path: "README.md",
        content: `# FastAPI Python API

A modern FastAPI application with automatic OpenAPI docs.

## Getting Started

\`\`\`bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 3000 --reload
\`\`\`

The API will be available at http://localhost:3000
API docs at http://localhost:3000/docs

## Endpoints

- GET / - Welcome message
- GET /api/health - Health check
`,
        language: "markdown",
      },
    ],
    packages: {
      pip: ["fastapi", "uvicorn"],
    },
    devCommand: "uvicorn main:app --host 0.0.0.0 --port 3000 --reload",
  },
  {
    id: "nextjs-ts",
    name: "Next.js 14 (TypeScript)",
    description: "Next.js with App Router, TypeScript, and Tailwind CSS",
    category: "fullstack",
    language: "typescript",
    framework: "Next.js",
    icon: "▲",
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: "nextjs-app",
            version: "1.0.0",
            scripts: {
              dev: "next dev -p 3000",
              build: "next build",
              start: "next start -p 3000",
            },
            dependencies: {
              next: "^14.1.0",
              react: "^18.2.0",
              "react-dom": "^18.2.0",
            },
            devDependencies: {
              "@types/node": "^20.0.0",
              "@types/react": "^18.2.0",
              "@types/react-dom": "^18.2.0",
              autoprefixer: "^10.4.0",
              postcss: "^8.4.0",
              tailwindcss: "^3.4.0",
              typescript: "^5.2.0",
            },
          },
          null,
          2
        ),
        language: "json",
      },
      {
        path: "app/page.tsx",
        content: `export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Welcome to Next.js 14</h1>
        <p className="text-xl text-gray-600">
          Get started by editing <code className="bg-gray-100 px-2 py-1 rounded">app/page.tsx</code>
        </p>
      </div>
    </main>
  )
}`,
        language: "typescript",
      },
      {
        path: "app/layout.tsx",
        content: `import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Next.js App',
  description: 'Created with Next.js 14',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}`,
        language: "typescript",
      },
      {
        path: "app/globals.css",
        content: `@tailwind base;
@tailwind components;
@tailwind utilities;`,
        language: "css",
      },
      {
        path: "tailwind.config.ts",
        content: `import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
export default config`,
        language: "typescript",
      },
      {
        path: "postcss.config.js",
        content: `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}`,
        language: "javascript",
      },
      {
        path: "tsconfig.json",
        content: JSON.stringify(
          {
            compilerOptions: {
              target: "ES2017",
              lib: ["dom", "dom.iterable", "esnext"],
              allowJs: true,
              skipLibCheck: true,
              strict: true,
              noEmit: true,
              esModuleInterop: true,
              module: "esnext",
              moduleResolution: "bundler",
              resolveJsonModule: true,
              isolatedModules: true,
              jsx: "preserve",
              incremental: true,
              plugins: [{ name: "next" }],
              paths: { "@/*": ["./*"] },
            },
            include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
            exclude: ["node_modules"],
          },
          null,
          2
        ),
        language: "json",
      },
      {
        path: "next.config.js",
        content: `/** @type {import('next').NextConfig} */
const nextConfig = {}

module.exports = nextConfig`,
        language: "javascript",
      },
      {
        path: "README.md",
        content: `# Next.js 14 App

This is a Next.js application with App Router and Tailwind CSS.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

The app will be available at http://localhost:3000
`,
        language: "markdown",
      },
    ],
    packages: {
      npm: [
        "next",
        "react",
        "react-dom",
        "typescript",
        "@types/node",
        "@types/react",
        "@types/react-dom",
        "tailwindcss",
        "autoprefixer",
        "postcss",
      ],
    },
    devCommand: "npm run dev",
    buildCommand: "npm run build",
  },
];

/**
 * Get template by ID
 */
export function getTemplateById(id: string): Template | undefined {
  return templates.find((t) => t.id === id);
}

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: Template["category"]): Template[] {
  return templates.filter((t) => t.category === category);
}

/**
 * Get all template IDs for quick lookup
 */
export function getAllTemplateIds(): string[] {
  return templates.map((t) => t.id);
}
