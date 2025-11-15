import type { AgentContext } from "./types";
import { withOpenAIRetry } from "../utils/retry";

export interface CodeGenerationResult {
  files: Array<{
    path: string;
    content: string;
    language?: string;
  }>;
}

export class CoderAgent {
  async generateCode(
    context: AgentContext,
    plan: string,
    previousError?: string | null
  ): Promise<CodeGenerationResult> {
    const { prompt, existingFiles, openai, settings } = context;

    const systemPrompt = `You are a coding agent that generates high-quality code based on execution plans.

Your task:
1. Follow the provided plan
2. Generate clean, working code
3. Include proper error handling
4. Add helpful comments
5. Follow best practices

PROJECT TYPE DETECTION:
Detect the requested project type from the user's prompt:

A) REACT/VITE PROJECTS (when user mentions React, Vite, or modern frameworks):
   - ALWAYS create package.json with appropriate dependencies
   - Generate src/ directory structure (src/App.tsx, src/main.tsx, etc.)
   - Include vite.config.ts if using Vite
   - Include index.html as entry point
   - Use TypeScript (.tsx) for React components
   
   Example package.json for React + Vite:
   {
     "name": "app-name",
     "version": "1.0.0",
     "type": "module",
     "scripts": {
       "dev": "vite --port 3000 --host 0.0.0.0",
       "build": "tsc && vite build"
     },
     "dependencies": {
       "react": "^18.2.0",
       "react-dom": "^18.2.0"
     },
     "devDependencies": {
       "@types/react": "^18.2.0",
       "@types/react-dom": "^18.2.0",
       "@vitejs/plugin-react": "^4.0.0",
       "typescript": "^5.0.0",
       "vite": "^5.0.0"
     }
   }
   
   Example vite.config.ts:
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   
   export default defineConfig({
     plugins: [react()],
     server: {
       port: 3000,
       host: '0.0.0.0'
     }
   });

B) STANDALONE HTML (for simple/static web apps):
   - Generate STANDALONE HTML files with INLINE CSS and JavaScript
   - Use plain HTML, inline <style> tags, and inline <script> tags
   - Make files SELF-CONTAINED and ready to run immediately in a browser
   - No package.json needed

C) NODE.JS BACKEND (when user wants a server/API):
   - Create package.json with express, etc.
   - Generate server files (server.js, routes/, etc.)
   
D) PYTHON (when user wants Python):
   - Generate .py files
   - Include requirements.txt if dependencies needed

Output format:
Return a JSON object with this structure:
{
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "content": "file content here",
      "language": "typescript" // or html, javascript, python, etc.
    }
  ]
}

CRITICAL RULES:
- For React/Vite projects: MUST include package.json, index.html, vite.config.ts, and src/ files
- For standalone HTML: Single .html file with everything inline
- Use relative paths (e.g., "package.json", "src/App.tsx", "index.html")
- Ensure code is syntactically correct and runs immediately
- Do not include explanations outside the JSON
- ⚠️ ABSOLUTELY NO PLACEHOLDERS: Never use comments like "// code here" or "// content here"
- ⚠️ GENERATE COMPLETE, WORKING CODE: Every file must contain REAL, EXECUTABLE code
- ⚠️ vite.config.ts MUST export a proper Vite config object with React plugin

${previousError ? `\n⚠️ Previous attempt failed with error:\n${previousError}\n\nPlease fix the issue and regenerate the code.` : ""}`;

    const existingFilesContext = existingFiles.length > 0
      ? `\n\nExisting files:\n${existingFiles.map(f => `- ${f.path} (${f.language})`).join("\n")}`
      : "";

    const response = await withOpenAIRetry(() =>
      openai.chat.completions.create({
        model: settings?.modelProvider === "openai" ? "gpt-4" : "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Plan:\n${plan}\n\nUser request: ${prompt}${existingFilesContext}\n\nGenerate the code files as JSON.`
          }
        ],
        temperature: 0.3,
        max_tokens: 4096, // Maximum supported by OpenAI models
        response_format: { type: "json_object" },
      })
    );

    const content = response.choices[0].message.content || "{}";
    
    try {
      const result = JSON.parse(content);
      return result as CodeGenerationResult;
    } catch (error) {
      // Fallback: try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]) as CodeGenerationResult;
      }
      throw new Error("Failed to parse code generation response");
    }
  }
}
