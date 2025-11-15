import type { AgentContext } from "./types";
import { withOpenAIRetry } from "../utils/retry";
import { REACT_VITE_TEMPLATE } from "./templates/react-vite";

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

    // Detect if this is a React/Vite project (template-based approach)
    const promptLower = prompt.toLowerCase();
    const isReactVite = promptLower.includes('react') || promptLower.includes('vite') || 
                        promptLower.includes('counter') || promptLower.includes('component');
    
    if (isReactVite && existingFiles.length === 0) {
      // Use template for scaffold files, only generate custom components
      const scaffoldFiles = Object.entries(REACT_VITE_TEMPLATE).map(([path, content]) => ({
        path,
        content,
        language: path.endsWith('.ts') || path.endsWith('.tsx') ? 'typescript' : 
                  path.endsWith('.json') ? 'json' : 
                  path.endsWith('.html') ? 'html' : 
                  path.endsWith('.css') ? 'css' : 'text'
      }));

      // Ask the model to ONLY generate custom component files (App.tsx, Counter.tsx, etc.)
      const componentPrompt = `You are generating ONLY custom React component files for: ${prompt}

The project scaffold (package.json, index.html, vite.config.ts, tsconfig.json, src/main.tsx, src/index.css) is already created.

Your task:
1. Generate ONLY custom component files: src/App.tsx and any additional components mentioned in the request
2. DO NOT generate package.json, index.html, vite.config.ts, tsconfig.json, or src/main.tsx (they already exist)
3. Components should be placed in src/ directory
4. Use TypeScript (.tsx) and functional components with hooks
5. Include proper imports and exports
6. ⚠️ CRITICAL: Ensure ALL JSX tags are properly closed (every <button> must have </button>, etc.)
7. ⚠️ Write syntactically correct, runnable code - no placeholders or comments

Code quality requirements:
- All JSX tags must be properly closed
- All imports must be valid
- All functions must be complete
- No syntax errors whatsoever

Output format - JSON object:
{
  "files": [
    {
      "path": "src/App.tsx",
      "content": "import { useState } from 'react';\n\nfunction App() {\n  const [count, setCount] = useState(0);\n  return (\n    <div>\n      <h1>Counter: {count}</h1>\n      <button onClick={() => setCount(count + 1)}>Increment</button>\n      <button onClick={() => setCount(count - 1)}>Decrement</button>\n    </div>\n  );\n}\n\nexport default App;",
      "language": "typescript"
    }
  ]
}

${previousError ? `\n⚠️ Previous attempt failed: ${previousError}\nFix the exact error mentioned and regenerate clean, working code.` : ""}`;

      try {
        const response = await withOpenAIRetry(() =>
          openai.chat.completions.create({
            model: settings?.modelProvider === "openai" ? "gpt-4" : "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "You are a React component generator. Generate clean, working TypeScript React components." },
              { role: "user", content: componentPrompt }
            ],
            temperature: 0.3,
            max_tokens: 2048, // Components only, less tokens needed
            response_format: { type: "json_object" },
          })
        );

        const content = response.choices[0].message.content || "{}";
        const result = JSON.parse(content) as CodeGenerationResult;
        
        // Combine scaffold + generated components
        return {
          files: [...scaffoldFiles, ...result.files]
        };
      } catch (error: any) {
        console.error("[Coder] Template-based generation failed:", error);
        // Fall back to full generation if template approach fails
      }
    }

    // Original full-generation approach for non-React or existing projects
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
   
   Example index.html:
   <!DOCTYPE html>
   <html lang="en">
   <head>
     <meta charset="UTF-8" />
     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
     <title>App Title</title>
   </head>
   <body>
     <div id="root"></div>
     <script type="module" src="/src/main.tsx"></script>
   </body>
   </html>

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

CRITICAL RULES FOR REACT/VITE PROJECTS:
⚠️ You MUST generate ALL of these files in a single response:
1. package.json - with "devDependencies.vite" (see example above)
2. index.html - HTML entry point (see example above)
3. vite.config.ts - Vite configuration with react plugin (see example above)
4. src/main.tsx - React entry point that renders to #root
5. src/App.tsx - Main React component
6. Additional component files as needed

If ANY of these are missing, the project will FAIL validation and you'll be asked to retry!

GENERAL RULES:
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
