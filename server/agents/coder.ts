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

Output format:
Return a JSON object with this structure:
{
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "content": "file content here",
      "language": "javascript" // or python, typescript, etc.
    }
  ]
}

Rules:
- Use relative paths (e.g., "src/app.js", "main.py")
- Include all necessary files
- Ensure code is syntactically correct
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
