"""
Coder Agent - Code Generation
Implements the plan by generating and modifying code files
"""

from typing import Dict, Any, List
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from models.state import AgentWorkflowState, AgentStep, FileChange
import os
import json

class CoderAgent:
    """
    Coder Agent generates code based on the Planner's tasks
    Understands context from existing files and creates/modifies code
    """
    
    def __init__(self):
        self.llm = ChatOpenAI(
            model="gpt-4-turbo-preview",
            temperature=0.2,
            api_key=os.getenv("OPENAI_API_KEY")
        )
        
        self.prompt_template = ChatPromptTemplate.from_messages([
            ("system", """You are an expert full-stack developer who writes production-quality code.

Your job is to implement the given plan by generating complete, working code files.

Guidelines:
1. Write complete files, not snippets or placeholders
2. Follow best practices and modern patterns
3. Include necessary imports and dependencies
4. Add brief comments for complex logic
5. Ensure code is ready to run without modifications
6. Use TypeScript for frontend/backend, Python for scripts
7. Follow the project's existing patterns and conventions

Output Format (JSON):
{
  "files_to_create": [
    {
      "path": "path/to/file.ts",
      "content": "full file content here",
      "language": "typescript",
      "action": "create"
    }
  ],
  "files_to_update": [
    {
      "path": "existing/file.ts",
      "content": "updated full content",
      "language": "typescript",
      "action": "update"
    }
  ],
  "summary": "Brief description of what was implemented"
}

Write production-ready code that works correctly."""),
            ("user", """Implementation Plan:
{plan}

Tasks to Implement:
{tasks}

Existing Files:
{existing_files}

Generate complete, working code files to implement this plan.""")
        ])
    
    async def code(self, state: AgentWorkflowState) -> AgentWorkflowState:
        """
        Generate code files based on plan
        Updates state with files_to_create and files_to_update
        """
        try:
            # Format plan and tasks
            plan = state.get("plan", "No plan provided")
            tasks_str = "\n".join([f"{i+1}. {task}" for i, task in enumerate(state.get("tasks", []))])
            
            # Format existing files
            existing_files_str = "\n".join([
                f"- {f.get('path')}: {f.get('language', 'unknown')}"
                for f in state.get("existing_files", [])
            ]) or "No existing files"
            
            # Call LLM
            messages = self.prompt_template.format_messages(
                plan=plan,
                tasks=tasks_str,
                existing_files=existing_files_str
            )
            
            response = await self.llm.ainvoke(messages)
            code_output = response.content
            
            # Parse JSON response
            files_data = self._parse_code_output(code_output)
            
            # Update state
            state["files_to_create"] = files_data.get("files_to_create", [])
            state["files_to_update"] = files_data.get("files_to_update", [])
            state["current_step"] = AgentStep.CODING
            
            total_files = len(state["files_to_create"]) + len(state["files_to_update"])
            state["logs"].append(f"[Coder] Generated {total_files} files")
            
            return state
            
        except Exception as e:
            state["errors"].append(f"[Coder Error] {str(e)}")
            state["logs"].append(f"[Coder] Failed: {str(e)}")
            return state
    
    def _parse_code_output(self, output: str) -> Dict[str, Any]:
        """Parse LLM output to extract file changes"""
        try:
            # Try to find JSON in output
            json_start = output.find("{")
            json_end = output.rfind("}") + 1
            
            if json_start >= 0 and json_end > json_start:
                json_str = output[json_start:json_end]
                return json.loads(json_str)
            
            # Fallback: return empty structure
            return {"files_to_create": [], "files_to_update": []}
            
        except json.JSONDecodeError:
            return {"files_to_create": [], "files_to_update": []}
