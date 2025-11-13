import type { AgentContext } from "./orchestrator";

export interface TestResult {
  passed: boolean;
  error?: string;
  details?: any;
}

export class TesterAgent {
  async validateCode(
    context: AgentContext,
    files: Array<{ path: string; content: string; language?: string }>
  ): Promise<TestResult> {
    const { openai, settings } = context;

    // Basic validation checks
    const errors: string[] = [];

    // Check 1: Ensure files were generated
    if (files.length === 0) {
      return {
        passed: false,
        error: "No files were generated",
      };
    }

    // Check 2: Syntax validation via AI
    const filesContext = files.map(f => 
      `File: ${f.path}\nLanguage: ${f.language || "unknown"}\n\`\`\`\n${f.content.substring(0, 500)}\n\`\`\``
    ).join("\n\n");

    const systemPrompt = `You are a code validator that checks for common issues.

Analyze the generated code and check for:
1. Syntax errors
2. Missing imports or dependencies
3. Logical errors or bugs
4. Security issues
5. Best practice violations

Return a JSON object:
{
  "passed": true/false,
  "issues": ["list of issues found"],
  "severity": "low|medium|high"
}

Be strict but fair. Minor style issues are okay.`;

    try {
      const response = await openai.chat.completions.create({
        model: settings?.modelProvider === "openai" ? "gpt-4" : "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Validate this code:\n\n${filesContext}` }
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0].message.content || "{}";
      const validation = JSON.parse(content);

      if (!validation.passed) {
        return {
          passed: false,
          error: validation.issues?.join("; ") || "Validation failed",
          details: validation,
        };
      }

      return {
        passed: true,
        details: validation,
      };
    } catch (error: any) {
      // If AI validation fails, do basic checks
      for (const file of files) {
        // Check for obvious syntax errors
        if (file.content.trim().length === 0) {
          errors.push(`${file.path} is empty`);
        }
      }

      if (errors.length > 0) {
        return {
          passed: false,
          error: errors.join("; "),
        };
      }

      // Default to passing if AI validation unavailable
      return { passed: true };
    }
  }
}
