"""
Agent workflow state management
Defines the state structure for LangGraph workflow
"""

from typing import TypedDict, List, Dict, Any, Optional
from enum import Enum

class AgentStep(str, Enum):
    """Agent workflow steps"""
    IDLE = "idle"
    PLANNING = "planning"
    CODING = "coding"
    TESTING = "testing"
    FIXING = "fixing"
    COMPLETE = "complete"
    FAILED = "failed"

class FileChange(TypedDict):
    """Represents a file change (create, update, delete)"""
    path: str
    content: str
    action: str  # 'create', 'update', 'delete'
    language: str

class TestResult(TypedDict):
    """Test execution result"""
    passed: bool
    errors: List[str]
    output: str

class AgentWorkflowState(TypedDict):
    """
    Complete state for LangGraph workflow
    Passed between agents (Planner → Coder → Tester)
    """
    # Input
    prompt: str
    workspace_id: str
    existing_files: List[Dict[str, Any]]
    context: Dict[str, Any]
    
    # Workflow state
    current_step: AgentStep
    attempt_count: int
    max_attempts: int
    
    # Planner output
    plan: Optional[str]
    tasks: List[str]
    
    # Coder output
    files_to_create: List[FileChange]
    files_to_update: List[FileChange]
    
    # Tester output
    test_results: Optional[TestResult]
    validation_errors: List[str]
    
    # Logs
    logs: List[str]
    errors: List[str]
    
    # Final output
    success: bool
    final_files: List[FileChange]
