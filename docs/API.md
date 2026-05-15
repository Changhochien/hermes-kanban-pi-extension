# Hermes Kanban Pi Extension — API Reference

## Tools

### kanban_list

List tasks with optional filters.

**Parameters:**
```typescript
{
  status?: "triage" | "todo" | "ready" | "running" | "blocked" | "done" | "archived",
  assignee?: string,
  tenant?: string,
  limit?: number  // default: 50, max: 200
}
```

**Returns:**
```json
{
  "tasks": [
    {
      "id": "t_12345678",
      "title": "Task title",
      "status": "ready",
      "assignee": "researcher",
      "priority": 10,
      "parent_count": 1,
      "child_count": 3
    }
  ],
  "count": 1,
  "truncated": false,
  "filters": { "status": null, "assignee": null }
}
```

---

### kanban_board

Get full board grouped by column.

**Parameters:** None

**Returns:**
```json
{
  "columns": [
    { "name": "triage", "tasks": [...] },
    { "name": "todo", "tasks": [...] },
    { "name": "ready", "tasks": [...] },
    { "name": "running", "tasks": [...] },
    { "name": "blocked", "tasks": [...] },
    { "name": "done", "tasks": [...] }
  ],
  "stats": {
    "total": 25,
    "by_status": { "triage": 3, "todo": 10, ... },
    "by_assignee": { "researcher": 5, ... },
    "oldest_ready_age_seconds": 3600
  }
}
```

---

### kanban_show

Get detailed task information.

**Parameters:**
```typescript
{
  task_id: string  // required, format: t_<hex8>
}
```

**Returns:**
```json
{
  "task": {
    "id": "t_12345678",
    "title": "Task title",
    "body": "Full description...",
    "status": "running",
    "assignee": "researcher",
    "created_at": 1715000000,
    "started_at": 1715000100,
    "current_run_id": 42
  },
  "parents": ["t_11111111"],
  "children": ["t_22222222"],
  "comments": [
    { "author": "researcher", "body": "Note...", "created_at": 1715000200 }
  ],
  "events": [...],
  "runs": [...]
}
```

---

### kanban_create

Create a new task.

**Parameters:**
```typescript
{
  title: string,                    // required
  assignee: string,                 // required
  body?: string,
  priority?: number,                 // default: 0
  parents?: string[],
  workspace_kind?: "scratch" | "dir" | "worktree",
  workspace_path?: string,
  triage?: boolean,                 // default: false
  skills?: string[]
}
```

**Returns:**
```
Task created successfully.
t_87654321 created with status 'todo'
```

---

### kanban_complete

Mark task as completed.

**Parameters:**
```typescript
{
  task_id?: string,                  // defaults to HERMES_KANBAN_TASK env
  summary: string,                  // required
  metadata?: Record<string, any>,
  result?: string,
  created_cards?: string[]
}
```

**Returns:**
```
Task t_12345678 marked as complete.
```

---

### kanban_block

Block task pending input.

**Parameters:**
```typescript
{
  task_id?: string,                 // defaults to HERMES_KANBAN_TASK env
  reason: string                    // required
}
```

**Returns:**
```
Task t_12345678 blocked.
Reason: Waiting for API credentials
```

---

### kanban_comment

Add comment to task.

**Parameters:**
```typescript
{
  task_id: string,                  // required
  body: string                      // required
}
```

**Returns:**
```
Comment added to task t_12345678.
```

---

### kanban_link

Create parent→child dependency.

**Parameters:**
```typescript
{
  parent_id: string,                // required
  child_id: string                  // required
}
```

**Returns:**
```
Linked tasks: t_11111111 → t_22222222
```

---

### kanban_diagnostics

Check task health issues.

**Parameters:**
```typescript
{
  severity?: "warning" | "error" | "critical"
}
```

**Returns:**
```json
{
  "diagnostics": [
    {
      "task_id": "t_12345678",
      "task_title": "Analysis",
      "task_status": "running",
      "diagnostics": [
        {
          "kind": "stale_running",
          "severity": "warning",
          "message": "Task running for 2+ hours without heartbeat",
          "last_seen_at": 1715000000
        }
      ]
    }
  ],
  "count": 1
}
```

---

### kanban_stats

Get board statistics.

**Parameters:** None

**Returns:**
```json
{
  "total": 25,
  "by_status": {
    "triage": 3,
    "todo": 10,
    "ready": 5,
    "running": 2,
    "blocked": 1,
    "done": 47,
    "archived": 0
  },
  "by_assignee": {
    "researcher": 8,
    "coder": 5,
    "reviewer": 3
  },
  "oldest_ready_age_seconds": 3600
}
```

---

## Commands

### /kanban-board

Quick board overview in TUI notification.

**Usage:** `/kanban-board`

### /kanban-stats

Quick statistics in TUI notification.

**Usage:** `/kanban-stats`

---

## Error Handling

All tools return structured errors:

```json
{
  "content": [{ "type": "text", "text": "Error: <message>" }],
  "details": { "tool": "<tool_name>", "error": "<message>" }
}
```

### Common Errors

| Error | Cause |
|-------|-------|
| Task not found | Invalid task_id |
| task_id required | Missing task_id when no HERMES_KANBAN_TASK env |
| Failed to create task | CLI error (check hermes installation) |
| Hermes kanban not found | hermes CLI not in PATH |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| HERMES_HOME | Hermes configuration root | ~/.hermes |
| HERMES_KANBAN_TASK | Current task ID (for workers) | - |

---

## Database Path Resolution

1. `HERMES_KANBAN_DB` env var (if set)
2. `HERMES_HOME/kanban.db`
3. `~/.hermes/kanban.db`

For multi-board:
- `HERMES_HOME/kanban/boards/<slug>/kanban.db`
