"""
Planner Agent - Task Decomposition
Analyzes user requirements and creates implementation plan
"""

from typing import Dict, Any, List
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from models.state import AgentWorkflowState, AgentStep
import os

class PlannerAgent:
    """
    Planner Agent breaks down user requirements into actionable tasks
    Analyzes existing codebase context and creates detailed implementation plan
    """
    
    def __init__(self):
        self.llm = ChatOpenAI(
            model="gpt-4-turbo-preview",
            temperature=0.3,
            api_key=os.getenv("OPENAI_API_KEY")
        )
        
        self.prompt_template = ChatPromptTemplate.from_messages([
            ("system", """You are a senior software architect and technical planner.
Your job is to analyze user requirements and create detailed implementation plans.

Given a user prompt, you must:
1. Understand the requirements thoroughly
2. Analyze the existing codebase context (if provided)
3. Break down the work into specific, actionable tasks
4. Identify which files need to be created or modified
5. Plan the technical approach and architecture

Output a JSON plan with:
- summary: Brief overview of what needs to be built
- tasks: Array of specific tasks to implement
- files_to_create: Array of {path, purpose, language} for new files
- files_to_modify: Array of {path, changes_needed} for existing files
- technical_notes: Important architectural or technical considerations

Be specific and actionable. The Coder agent will implement your plan."""),
            ("user", """User Request: {prompt}

Existing Files in Workspace:
{existing_files}

Additional Context:
{context}

Create a detailed implementation plan.""")
        ])
    
    async def plan(self, state: AgentWorkflowState) -> AgentWorkflowState:
        """
        Generate implementation plan from user prompt
        Updates state with plan and tasks
        """
        # Reset success flag at start of each attempt
        state["success"] = False
        
        try:
            # Format existing files for context
            existing_files_str = "\n".join([
                f"- {f.get('path')}: {f.get('language', 'unknown')}"
                for f in state.get("existing_files", [])
            ]) or "No existing files"
            
            # Format context
            context_str = "\n".join([
                f"{k}: {v}" for k, v in state.get("context", {}).items()
            ]) or "No additional context"
            
            # Call LLM
            messages = self.prompt_template.format_messages(
                prompt=state["prompt"],
                existing_files=existing_files_str,
                context=context_str
            )
            
            response = await self.llm.ainvoke(messages)
            plan_text = response.content
            
            # Parse plan (expecting JSON or structured text)
            # For now, store as-is and extract tasks
            tasks = self._extract_tasks(plan_text)
            
            # Update state
            state["plan"] = plan_text
            state["tasks"] = tasks
            state["current_step"] = AgentStep.PLANNING
            state["logs"].append(f"[Planner] Generated plan with {len(tasks)} tasks")
            
            return state
            
        except Exception as e:
            state["errors"].append(f"[Planner Error] {str(e)}")
            state["logs"].append(f"[Planner] Failed: {str(e)}")
            return state
    
    def _extract_tasks(self, plan_text: str) -> List[str]:
        """Extract task list from plan text"""
        # Simple extraction - look for numbered/bulleted lists
        tasks = []
        lines = plan_text.split("\n")
        
        for line in lines:
            line = line.strip()
            # Match numbered tasks (1. Task, 2. Task)
            if line and (line[0].isdigit() or line.startswith("-") or line.startswith("*")):
                # Clean up formatting
                task = line.lstrip("0123456789.-* ").strip()
                if task and len(task) > 10:  # Filter out too-short lines
                    tasks.append(task)
        
        return tasks if tasks else ["Implement the requested feature"]
