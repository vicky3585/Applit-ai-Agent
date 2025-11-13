import type { AgentContext } from "./types";

export class PlannerAgent {
  async createPlan(context: AgentContext): Promise<string> {
    const { prompt, existingFiles, openai, settings } = context;

    const systemPrompt = `You are a planning agent that analyzes user requests and creates detailed execution plans.

Your task:
1. Analyze the user's request
2. Understand the existing project structure
3. Create a clear, step-by-step plan for implementation

Output format:
- Be concise but specific
- List concrete steps
- Identify files that need to be created or modified
- Note any dependencies or prerequisites
- Consider edge cases

Project context:
Existing files: ${existingFiles.length > 0 ? existingFiles.map(f => f.path).join(", ") : "None (new project)"}`;

    const response = await openai.chat.completions.create({
      model: settings?.modelProvider === "openai" ? "gpt-4" : "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Create a plan for: ${prompt}` }
      ],
      temperature: 0.7,
      max_tokens: 1000,
    });

    return response.choices[0].message.content || "No plan generated";
  }
}
