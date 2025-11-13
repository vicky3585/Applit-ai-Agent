import type { AgentContext } from "./types";

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

IMPORTANT FOR HTML/WEB APPS:
- Generate STANDALONE HTML files with INLINE CSS and JavaScript
- Do NOT create separate .tsx, .jsx, .css files unless explicitly requested
- Do NOT reference external React, Vue, or framework libraries
- Use plain HTML, inline <style> tags, and inline <script> tags
- Make files SELF-CONTAINED and ready to run immediately in a browser

Output format:
Return a JSON object with this structure:
{
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "content": "file content here",
      "language": "html" // or javascript, python, etc.
    }
  ]
}

Rules:
- For web apps: Create .html files with everything inline
- Use relative paths (e.g., "calculator.html", "todo-app.html")
- Include all necessary code in a single file when possible
- Ensure code is syntactically correct and runs immediately
- Do not include explanations outside the JSON

${previousError ? `\n⚠️ Previous attempt failed with error:\n${previousError}\n\nPlease fix the issue and regenerate the code.` : ""}`;

    const existingFilesContext = existingFiles.length > 0
      ? `\n\nExisting files:\n${existingFiles.map(f => `- ${f.path} (${f.language})`).join("\n")}`
      : "";

    const response = await openai.chat.completions.create({
      model: settings?.modelProvider === "openai" ? "gpt-4" : "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Plan:\n${plan}\n\nUser request: ${prompt}${existingFilesContext}\n\nGenerate the code files as JSON.`
        }
      ],
      temperature: 0.3,
      max_tokens: 2000,
      response_format: { type: "json_object" },
    });

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
