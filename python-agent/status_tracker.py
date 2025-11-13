"""
Workflow Status Tracker
Maintains current workflow state per workspace for status endpoint
"""

from typing import Dict, Optional
from models.state import AgentWorkflowState, AgentStep
from threading import Lock

class StatusTracker:
    """
    Thread-safe in-memory status tracking for agent workflows
    Stores current state per workspace_id
    """
    
    def __init__(self):
        self._states: Dict[str, AgentWorkflowState] = {}
        self._lock = Lock()
    
    def update(self, workspace_id: str, state: AgentWorkflowState) -> None:
        """Update workflow state for a workspace"""
        with self._lock:
            self._states[workspace_id] = state.copy()
    
    def get(self, workspace_id: str) -> Optional[AgentWorkflowState]:
        """Get current workflow state for a workspace"""
        with self._lock:
            return self._states.get(workspace_id)
    
    def clear(self, workspace_id: str) -> None:
        """Clear workflow state for a workspace"""
        with self._lock:
            if workspace_id in self._states:
                del self._states[workspace_id]
    
    def get_summary(self, workspace_id: str) -> Dict:
        """Get summary view of workflow state"""
        state = self.get(workspace_id)
        if not state:
            return {
                "status": "idle",
                "current_step": "none",
                "progress": 0.0,
                "logs": [],
                "files_generated": []
            }
        
        # Calculate progress based on current step (monotonically increasing)
        # FIXING uses testing progress to avoid backward jumps
        progress_map = {
            AgentStep.IDLE: 0.0,
            AgentStep.PLANNING: 0.2,
            AgentStep.CODING: 0.5,
            AgentStep.TESTING: 0.8,
            AgentStep.FIXING: 0.8,  # Keep testing progress, don't go backward
            AgentStep.COMPLETE: 1.0,
            AgentStep.FAILED: 0.8,  # Maintain last progress before failure
        }
        
        progress = progress_map.get(state["current_step"], 0.0)
        
        # Convert enum to string for JSON serialization
        current_step = state["current_step"]
        current_step_str = current_step.value if hasattr(current_step, "value") else str(current_step)
        
        return {
            "status": "complete" if state["success"] else (
                "failed" if state["current_step"] == AgentStep.FAILED else "processing"
            ),
            "current_step": current_step_str,  # ✅ String, not enum
            "progress": progress,
            "logs": state.get("logs", []),
            "files_generated": state.get("final_files", []),
            "errors": state.get("errors", []),
            "attempt_count": state.get("attempt_count", 0),
        }

# Global status tracker instance
_tracker_instance = None

def get_tracker() -> StatusTracker:
    """Get or create status tracker instance (singleton)"""
    global _tracker_instance
    if _tracker_instance is None:
        _tracker_instance = StatusTracker()
    return _tracker_instance
