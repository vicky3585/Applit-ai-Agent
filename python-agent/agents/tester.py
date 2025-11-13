"""
Tester Agent - Code Validation
Tests generated code for errors, validates correctness
"""

from typing import Dict, Any, List
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from models.state import AgentWorkflowState, AgentStep, TestResult
import os

class TesterAgent:
    """
    Tester Agent validates generated code
    Checks for syntax errors, logic issues, missing dependencies
    """
    
    def __init__(self):
        self.llm = ChatOpenAI(
            model="gpt-4-turbo-preview",
            temperature=0.1,
            api_key=os.getenv("OPENAI_API_KEY")
        )
        
        self.prompt_template = ChatPromptTemplate.from_messages([
            ("system", """You are an expert code reviewer and QA engineer.

Your job is to review generated code and identify any issues:
1. Syntax errors or typos
2. Missing imports or dependencies
3. Logic errors or bugs
4. Incomplete implementations
5. Security vulnerabilities
6. Code that won't work as intended

Output Format (JSON):
{
  "passed": true/false,
  "errors": ["list of specific errors found"],
  "warnings": ["list of potential issues"],
  "suggestions": ["improvements that could be made"]
}

Be thorough but fair. If code is correct, pass it."""),
            ("user", """Review the following generated code:

Files to Create:
{files_to_create}

Files to Update:
{files_to_update}

Original Plan:
{plan}

Validate this code and report any errors or issues.""")
        ])
    
    async def test(self, state: AgentWorkflowState) -> AgentWorkflowState:
        """
        Validate generated code
        Updates state with test results and errors
        """
        try:
            # Format files for review
            files_create_str = self._format_files(state.get("files_to_create", []))
            files_update_str = self._format_files(state.get("files_to_update", []))
            plan = state.get("plan", "No plan")
            
            # Call LLM
            messages = self.prompt_template.format_messages(
                files_to_create=files_create_str,
                files_to_update=files_update_str,
                plan=plan
            )
            
            response = await self.llm.ainvoke(messages)
            test_output = response.content
            
            # Parse test results
            test_result = self._parse_test_output(test_output)
            
            # Update state
            state["test_results"] = test_result
            state["validation_errors"] = test_result.get("errors", [])
            state["current_step"] = AgentStep.TESTING
            
            if test_result["passed"]:
                state["success"] = True
                state["final_files"] = (
                    state.get("files_to_create", []) +
                    state.get("files_to_update", [])
                )
                state["logs"].append("[Tester] All tests passed ✓")
            else:
                # CRITICAL: Explicitly set success = False on test failure
                state["success"] = False
                error_count = len(test_result.get("errors", []))
                state["logs"].append(f"[Tester] Found {error_count} errors")
                
                # Check if we should retry
                if state["attempt_count"] < state["max_attempts"]:
                    state["logs"].append(f"[Tester] Will retry (attempt {state['attempt_count'] + 1}/{state['max_attempts']})")
                else:
                    state["logs"].append(f"[Tester] Max attempts reached, failing")
                    state["current_step"] = AgentStep.FAILED
            
            return state
            
        except Exception as e:
            state["errors"].append(f"[Tester Error] {str(e)}")
            state["logs"].append(f"[Tester] Failed: {str(e)}")
            state["success"] = False
            return state
    
    def _format_files(self, files: List[Dict]) -> str:
        """Format file list for review (FULL content, no truncation)"""
        if not files:
            return "No files"
        
        result = []
        for f in files:
            result.append(f"\n=== {f.get('path')} ===")
            result.append(f.get('content', ''))  # Full content for proper validation
        
        return "\n".join(result)
    
    def _parse_test_output(self, output: str) -> TestResult:
        """Parse LLM test output"""
        import json
        
        try:
            # Try to extract JSON
            json_start = output.find("{")
            json_end = output.rfind("}") + 1
            
            if json_start >= 0 and json_end > json_start:
                json_str = output[json_start:json_end]
                data = json.loads(json_str)
                
                return {
                    "passed": data.get("passed", False),
                    "errors": data.get("errors", []),
                    "output": output
                }
        except:
            pass
        
        # Fallback: assume pass if no errors mentioned
        has_errors = any(word in output.lower() for word in ["error", "fail", "bug", "issue", "problem"])
        
        return {
            "passed": not has_errors,
            "errors": [] if not has_errors else ["Validation failed - see output"],
            "output": output
        }
