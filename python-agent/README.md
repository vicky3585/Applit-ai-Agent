# Python Agent Service

LangGraph-based multi-agent system for AI-powered code generation.

## Architecture

This service implements a **Planner → Coder → Tester** workflow using LangGraph:

1. **Planner Agent**: Analyzes user requirements and creates implementation plan
2. **Coder Agent**: Generates code files based on the plan
3. **Tester Agent**: Validates generated code for errors
4. **Auto-retry Loop**: If tests fail, retry up to 3 times with error context

## Installation

```bash
cd python-agent
pip install -r requirements.txt
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
# Edit .env with your OPENAI_API_KEY
```

## Running the Service

Development mode:
```bash
python main.py
```

Production mode:
```bash
uvicorn main:app --host 0.0.0.0 --port 8001
```

## API Endpoints

### Health Check
```bash
GET /health
```

Returns service status and configuration.

### Generate Code
```bash
POST /generate
Content-Type: application/json

{
  "prompt": "Build a todo app with React",
  "workspace_id": "workspace-123",
  "existing_files": [],
  "context": {}
}
```

Returns agent state with generated files.

### Get Status
```bash
GET /status/{workspace_id}
```

Returns current workflow status for a workspace.

## Integration with Node.js Backend

The Node.js backend communicates with this service via REST API:

1. User sends prompt through WebSocket → Node.js backend
2. Backend calls `/generate` endpoint on this service
3. Service runs LangGraph workflow (Planner → Coder → Tester)
4. Returns generated files to Node.js backend
5. Backend creates files in workspace and updates UI

## Agent Details

### Planner Agent
- Model: GPT-4 Turbo
- Temperature: 0.3 (focused but creative)
- Analyzes requirements and existing code
- Creates detailed implementation plan

### Coder Agent
- Model: GPT-4 Turbo
- Temperature: 0.2 (deterministic)
- Generates production-ready code
- Follows best practices and patterns

### Tester Agent
- Model: GPT-4 Turbo
- Temperature: 0.1 (very deterministic)
- Validates syntax, logic, security
- Reports errors for retry loop

## State Management

The workflow state (`AgentWorkflowState`) includes:
- Input: prompt, workspace_id, existing_files, context
- Plan: tasks, architecture notes
- Code: files_to_create, files_to_update
- Tests: validation_errors, test_results
- Output: success, final_files, logs

## Future Enhancements

- [ ] Real code execution in Docker sandbox for testing
- [ ] Vector memory with pgvector for context
- [ ] Streaming updates via WebSocket
- [ ] Cost tracking and optimization
- [ ] Local LLM support with vLLM (GPU)
