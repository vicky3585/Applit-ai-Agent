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
    
    console.log(`[Coder] Template detection: isReactVite=${isReactVite}, existingFiles=${existingFiles.length}`);
    
    if (isReactVite && existingFiles.length === 0) {
      console.log('[Coder] Using template-based generation for React/Vite project');
      
      // Use template for scaffold files, only generate custom components
      const scaffoldFiles = Object.entries(REACT_VITE_TEMPLATE).map(([path, content]) => ({
        path,
        content,
        language: path.endsWith('.ts') || path.endsWith('.tsx') ? 'typescript' : 
                  path.endsWith('.json') ? 'json' : 
                  path.endsWith('.html') ? 'html' : 
                  path.endsWith('.css') ? 'css' : 'text'
      }));
      
      console.log(`[Coder] Created ${scaffoldFiles.length} scaffold files from template (includes working App.tsx)`);

      // Check if user wants custom components beyond the default App.tsx
      const needsCustomComponents = promptLower.includes('component') && 
        !promptLower.match(/simple|basic|quick/);
      
      if (!needsCustomComponents) {
        console.log('[Coder] Using default App.tsx from template (sufficient for simple counter)');
        return { files: scaffoldFiles };
      }

      console.log('[Coder] Generating additional custom components...');
      
      // Ask the model to ONLY generate additional custom component files
      const componentPrompt = `You are generating ONLY additional React component files for: ${prompt}

The project scaffold is already created with:
- package.json, index.html, vite.config.ts, tsconfig.json (✓ Already exists)
- src/main.tsx, src/index.css (✓ Already exists)  
- src/App.tsx with working counter functionality (✓ Already exists)

Your task:
1. Generate ONLY additional custom components if explicitly mentioned in the request
2. DO NOT regenerate App.tsx - it already exists with counter functionality
3. Place new components in src/ directory (e.g., src/Counter.tsx, src/Button.tsx)
4. Use TypeScript (.tsx) and functional components with hooks
5. Ensure proper imports and exports
6. ⚠️ CRITICAL: All JSX tags must be properly closed
7. Write syntactically correct code - no placeholders

Output format - JSON object with additional components only:
{
  "files": [
    {
      "path": "src/CustomComponent.tsx",
      "content": "complete working code here",
      "language": "typescript"
    }
  ]
}

${previousError ? `\n⚠️ Previous attempt failed: ${previousError}\nFix the exact error mentioned and regenerate clean, working code.` : ""}`;

      const response = await withOpenAIRetry(() =>
        openai.chat.completions.create({
          model: settings?.modelProvider === "openai" ? "gpt-4" : "gpt-3.5-turbo",
          messages: [
            { role: "system", content: "You are a React component generator. Generate clean, working TypeScript React components. ALWAYS respond with valid JSON in the exact format specified." },
            { role: "user", content: componentPrompt }
          ],
          temperature: 0.3,
          max_tokens: 2048,
        })
      );

      const content = response.choices[0].message.content || "{}";
      const result = JSON.parse(content) as CodeGenerationResult;
      
      console.log(`[Coder] Model generated ${result.files?.length || 0} component files`);
      
      // Combine scaffold + generated components
      const combinedFiles = [...scaffoldFiles, ...(result.files || [])];
      console.log(`[Coder] ✅ Template approach: ${combinedFiles.length} total files (${scaffoldFiles.length} scaffold + ${result.files?.length || 0} components)`);
      
      return {
        files: combinedFiles
      };
    } else {
      console.log(`[Coder] Skipping template approach (isReactVite=${isReactVite}, existingFiles=${existingFiles.length})`);
    }

    // Original full-generation approach for non-React or existing projects
    const systemPrompt = `You are a coding agent that generates high-quality code based on execution plans.

Your task:
1. Follow the provided plan
2. Generate clean, working code
3. Include proper error handling
4. Add helpful comments
5. Follow best practices

🚨 CRITICAL VERSION REQUIREMENTS - READ CAREFULLY:
When generating package.json files, you MUST use these EXACT version numbers:
- "vite": "^5.0.0" (NOT 2.x, NOT 3.x, NOT 4.x - ONLY 5.0.0+)
- "@vitejs/plugin-react": "^4.0.0"
- "typescript": "^5.0.0"
- "react": "^18.2.0"
- "react-dom": "^18.2.0"

Using older versions (especially Vite 2.x) will cause FATAL ERRORS. The application WILL NOT RUN.
Double-check your package.json before returning it!

PROJECT TYPE DETECTION:
Detect the requested project type from the user's prompt:

A) REACT/VITE PROJECTS (when user mentions React, Vite, or modern frameworks):
   - ALWAYS create package.json with appropriate dependencies
   - Generate src/ directory structure (src/App.tsx, src/main.tsx, etc.)
   - Include vite.config.ts if using Vite
   - Include index.html as entry point
   - Use TypeScript (.tsx) for React components
   
   REQUIRED package.json template (USE THESE EXACT VERSIONS):
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
          { role: "system", content: systemPrompt + "\n\nALWAYS respond with valid JSON in the exact format specified." },
          {
            role: "user",
            content: `Plan:\n${plan}\n\nUser request: ${prompt}${existingFilesContext}\n\nGenerate the code files as JSON.`
          }
        ],
        temperature: 0.3,
        max_tokens: 4096, // Maximum supported by OpenAI models
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
