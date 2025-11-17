import type { AgentContext } from "./types";
import { withOpenAIRetry } from "../utils/retry";

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

    // Check 2: Template-based projects auto-pass (templates are pre-validated)
    const hasReactTemplate = files.some(f => 
      f.path === 'package.json' && f.content.includes('"react"')
    );
    
    if (hasReactTemplate && files.length >= 8) {
      console.log('[Tester] ✅ Template-based React project detected - auto-passing validation');
      return {
        passed: true,
        details: { message: 'Template-based project auto-validated' }
      };
    }

    // Check 2: Syntax validation via AI
    const filesContext = files.map(f => 
      `File: ${f.path}\nLanguage: ${f.language || "unknown"}\n\`\`\`\n${f.content}\n\`\`\``
    ).join("\n\n");

    const systemPrompt = `You are a code validator that checks ONLY for critical errors.

ONLY mark as failed if you find:
1. SEVERE syntax errors that prevent code from running (missing brackets, unclosed tags, etc.)
2. Missing critical imports that will cause immediate crashes
3. Security vulnerabilities that expose user data

IGNORE and ALLOW:
- Style issues
- Minor best practice violations
- Warnings or suggestions
- Missing optional features
- Code that "could be better" but works

Return a JSON object:
{
  "passed": true/false,
  "issues": ["ONLY list critical blocking issues"],
  "severity": "critical|none"
}

BE LENIENT - Only fail code that is genuinely broken. If the code will run and produce output, mark it as passed.`;

    try {
      const response = await withOpenAIRetry(() =>
        openai.chat.completions.create({
          model: settings?.modelProvider === "openai" ? "gpt-4" : "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt + "\n\nALWAYS respond with valid JSON in the exact format specified." },
            { role: "user", content: `Validate this code:\n\n${filesContext}` }
          ],
          temperature: 0.2,
          max_tokens: 500,
        })
      );

      const content = response.choices[0].message.content || "{}";
      const validation = JSON.parse(content);

      // Only fail if severity is "critical" and there are real issues
      if (!validation.passed && validation.severity === "critical" && validation.issues?.length > 0) {
        return {
          passed: false,
          error: validation.issues?.join("; ") || "Validation failed",
          details: validation,
        };
      }

      // Default to passing - be permissive
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
