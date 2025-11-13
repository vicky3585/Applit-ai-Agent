"""
Python Agent Service - LangGraph Multi-Agent Orchestration
Implements Planner → Coder → Tester workflow for AI-powered code generation
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn

app = FastAPI(
    title="AI IDE Agent Service",
    description="LangGraph-based multi-agent system for code generation",
    version="1.0.0"
)

# CORS middleware for Node.js backend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Will restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request/Response Models
class GenerateCodeRequest(BaseModel):
    prompt: str
    workspace_id: str
    existing_files: Optional[List[Dict[str, Any]]] = []
    context: Optional[Dict[str, Any]] = {}

class AgentStateResponse(BaseModel):
    status: str
    current_step: str
    progress: float
    logs: List[str]
    files_generated: List[Dict[str, Any]]
    errors: Optional[List[str]] = []

class HealthResponse(BaseModel):
    status: str
    service: str
    openai_configured: bool

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    openai_key = os.getenv("OPENAI_API_KEY")
    return HealthResponse(
        status="healthy",
        service="python-agent",
        openai_configured=bool(openai_key)
    )

# Code generation endpoint (will implement LangGraph workflow)
@app.post("/generate", response_model=AgentStateResponse)
async def generate_code(request: GenerateCodeRequest):
    """
    Main endpoint for code generation using LangGraph workflow
    Planner → Coder → Tester → (optional) Fixer
    """
    try:
        from workflow import get_workflow
        from models.state import AgentWorkflowState
        from status_tracker import get_tracker
        
        # Create initial state
        initial_state: AgentWorkflowState = {
            "prompt": request.prompt,
            "workspace_id": request.workspace_id,
            "existing_files": request.existing_files or [],
            "context": request.context or {},
            "current_step": "idle",
            "attempt_count": 0,
            "max_attempts": 3,
            "plan": None,
            "tasks": [],
            "files_to_create": [],
            "files_to_update": [],
            "test_results": None,
            "validation_errors": [],
            "logs": [],
            "errors": [],
            "success": False,
            "final_files": []
        }
        
        # Initialize status tracking
        tracker = get_tracker()
        tracker.update(request.workspace_id, initial_state)
        
        # Run workflow using execute method (which calls ainvoke)
        workflow = get_workflow()
        final_state = await workflow.execute(initial_state)
        
        # Update final status
        tracker.update(request.workspace_id, final_state)
        
        # Convert to response format
        progress = 1.0 if final_state["success"] else 0.5
        
        # Convert enum to string for JSON serialization
        current_step = final_state["current_step"]
        current_step_str = current_step.value if hasattr(current_step, "value") else str(current_step)
        
        return AgentStateResponse(
            status="complete" if final_state["success"] else "failed",
            current_step=current_step_str,  # ✅ String, not enum
            progress=progress,
            logs=final_state["logs"],
            files_generated=final_state.get("final_files", []),
            errors=final_state.get("errors", [])
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Get workflow status endpoint
@app.get("/status/{workspace_id}", response_model=AgentStateResponse)
async def get_status(workspace_id: str):
    """Get current status of agent workflow for a workspace"""
    from status_tracker import get_tracker
    
    tracker = get_tracker()
    summary = tracker.get_summary(workspace_id)
    
    return AgentStateResponse(
        status=summary["status"],
        current_step=summary["current_step"],
        progress=summary["progress"],
        logs=summary["logs"],
        files_generated=summary.get("files_generated", []),
        errors=summary.get("errors", [])
    )

if __name__ == "__main__":
    port = int(os.getenv("AGENT_PORT", "8001"))
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
