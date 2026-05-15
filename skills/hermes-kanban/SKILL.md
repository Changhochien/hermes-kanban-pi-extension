---
name: hermes-kanban
description: Integrate with Hermes multi-agent Kanban board. Use when creating tasks for Hermes workers, monitoring board state, or coordinating multi-agent workflows.
---

# Hermes Kanban Integration

This skill provides access to the Hermes multi-agent Kanban board system.

## Available Tools

### Read Operations
- **kanban_list** — List tasks with filters
- **kanban_board** — View full board by column
- **kanban_show** — Get task details
- **kanban_stats** — Board statistics
- **kanban_diagnostics** — Check task health

### Write Operations
- **kanban_create** — Create new task
- **kanban_complete** — Mark task done
- **kanban_block** — Block pending input
- **kanban_comment** — Add comment
- **kanban_link** — Create dependency

## Task Lifecycle

```
triage → todo → ready → running → done
                   ↓
               blocked (unblock to continue)
```

## Quick Examples

### Create a research task
```
Use kanban_create with:
- title: "Research competitor analysis"
- assignee: "researcher"
- body: "Find top 5 competitors..."
```

### Check board status
```
Use kanban_board to see all columns
Use kanban_stats for quick overview
```

### Complete and hand off
```
Use kanban_complete with:
- task_id: "t_12345678"
- summary: "Completed analysis with findings"
- metadata: {"files_analyzed": 20}
```

## Notes

- Tasks require an assignee to be dispatched
- Use kanban_link for parent→child dependencies
- Comments persist for downstream workers
- Check kanban_diagnostics for stuck tasks
