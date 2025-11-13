"""
LangGraph Workflow - Agent Orchestration
Implements Planner → Coder → Tester loop with retry logic
"""

from typing import Dict, Any
from langgraph.graph import StateGraph, END
from models.state import AgentWorkflowState, AgentStep
from agents.planner import PlannerAgent
from agents.coder import CoderAgent
from agents.tester import TesterAgent

class AgentWorkflow:
    """
    LangGraph workflow orchestrating Planner → Coder → Tester
    Includes automatic retry logic (up to 3 attempts)
    """
    
    def __init__(self):
        self.planner = PlannerAgent()
        self.coder = CoderAgent()
        self.tester = TesterAgent()
        
        # Build LangGraph state machine
        self.graph = self._build_graph()
    
    def _build_graph(self) -> StateGraph:
        """Build the agent workflow graph"""
        
        # Create graph with our state type
        workflow = StateGraph(AgentWorkflowState)
        
        # Add agent nodes
        workflow.add_node("planner", self._planner_node)
        workflow.add_node("coder", self._coder_node)
        workflow.add_node("tester", self._tester_node)
        workflow.add_node("fixer", self._fixer_node)
        
        # Define edges (workflow flow)
        workflow.set_entry_point("planner")
        
        # Planner → Coder
        workflow.add_edge("planner", "coder")
        
        # Coder → Tester
        workflow.add_edge("coder", "tester")
        
        # Tester → conditional routing
        workflow.add_conditional_edges(
            "tester",
            self._should_retry,
            {
                "retry": "fixer",
                "end": END
            }
        )
        
        # Fixer → Coder (retry loop)
        workflow.add_edge("fixer", "coder")
        
        return workflow.compile()
    
    async def _planner_node(self, state: AgentWorkflowState) -> AgentWorkflowState:
        """Planner agent node"""
        state["logs"].append("[Workflow] Running Planner agent...")
        return await self.planner.plan(state)
    
    async def _coder_node(self, state: AgentWorkflowState) -> AgentWorkflowState:
        """Coder agent node"""
        state["logs"].append("[Workflow] Running Coder agent...")
        return await self.coder.code(state)
    
    async def _tester_node(self, state: AgentWorkflowState) -> AgentWorkflowState:
        """Tester agent node"""
        state["logs"].append("[Workflow] Running Tester agent...")
        return await self.tester.test(state)
    
    async def _fixer_node(self, state: AgentWorkflowState) -> AgentWorkflowState:
        """
        Fixer node - prepares state for retry
        Adds error context to help Coder improve on next attempt
        """
        state["attempt_count"] += 1
        state["logs"].append(f"[Workflow] Retry attempt {state['attempt_count']}/{state['max_attempts']}")
        
        # Feed tester errors back into plan/context for Coder
        error_context = "\n".join(state.get("validation_errors", []))
        
        # Augment plan with error feedback
        state["plan"] = f"""{state.get("plan", "")}

CRITICAL: Previous attempt failed with these errors:
{error_context}

You MUST fix these errors in the next implementation. Review the errors carefully and ensure the code addresses each issue."""
        
        # Add to context for explicit error tracking
        state["context"]["previous_errors"] = error_context
        state["context"]["retry_attempt"] = state["attempt_count"]
        
        return state
    
    def _should_retry(self, state: AgentWorkflowState) -> str:
        """
        Decision function: retry or end?
        CRITICAL: Caps total executions at EXACTLY max_attempts
        """
        test_passed = state.get("success", False)
        attempt_count = state.get("attempt_count", 0)
        max_attempts = state.get("max_attempts", 3)
        
        # Success case: tests passed
        if test_passed:
            state["current_step"] = AgentStep.COMPLETE
            return "end"
        
        # Failure case: check if we can retry
        # attempt_count starts at 0 (before first run)
        # Fixer increments AFTER this check
        # To cap at max_attempts total executions:
        # - Run 1: attempt_count=0, check: 0+1 >= 3? No (1 >= 3), retry
        # - Fixer increments to 1
        # - Run 2: attempt_count=1, check: 1+1 >= 3? No (2 >= 3), retry
        # - Fixer increments to 2  
        # - Run 3: attempt_count=2, check: 2+1 >= 3? Yes (3 >= 3), stop
        # Total: 3 executions (correct!)
        if (attempt_count + 1) >= max_attempts:
            # Max attempts exhausted, fail
            state["current_step"] = AgentStep.FAILED
            state["success"] = False
            state["logs"].append(f"[Workflow] Max attempts ({max_attempts}) reached - failing")
            return "end"
        
        # Can retry
        state["current_step"] = AgentStep.FIXING
        return "retry"
    
    async def execute(self, initial_state: AgentWorkflowState) -> AgentWorkflowState:
        """
        Execute the full workflow using LangGraph's ainvoke
        Returns final state with generated files or errors
        """
        try:
            # Initialize state
            initial_state["current_step"] = AgentStep.PLANNING
            initial_state["attempt_count"] = 0
            initial_state["logs"] = initial_state.get("logs", [])
            initial_state["errors"] = initial_state.get("errors", [])
            initial_state["success"] = False
            
            # Run graph using ainvoke (LangGraph's correct method)
            final_state = await self.graph.ainvoke(initial_state)
            
            return final_state
            
        except Exception as e:
            initial_state["errors"].append(f"[Workflow Error] {str(e)}")
            initial_state["current_step"] = AgentStep.FAILED
            initial_state["success"] = False
            return initial_state

# Global workflow instance
_workflow_instance = None

def get_workflow() -> AgentWorkflow:
    """Get or create workflow instance (singleton)"""
    global _workflow_instance
    if _workflow_instance is None:
        _workflow_instance = AgentWorkflow()
    return _workflow_instance
