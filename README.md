# Hermes Kanban Pi Extension

A [pi agent](https://pi.dev) extension that integrates with the [Hermes multi-agent Kanban board](https://github.com/NousResearch/hermes-agent) for task coordination.

## Features

### v2.0.0 — Now with Worker Support

- **14 Kanban Tools** — Full read/write operations across 14 tools
- **Multi-Board Support** — `board` parameter on all tools, `/kanban-switch` command
- **Pi as Hermes Worker** — Auto-context injection, completion detection
- **Worker Health Tools** — Heartbeat, reclaim stuck tasks
- **4 Slash Commands** — Quick board views, stats, web, switch

### Tools

| Tool | Description |
|------|-------------|
| `kanban_list` | List tasks with filters (status, assignee, tenant) |
| `kanban_board` | Get full board grouped by column |
| `kanban_show` | Get detailed task info (body, comments, events, runs) |
| `kanban_stats` | Get board statistics |
| `kanban_diagnostics` | Check for task health issues |
| `kanban_create` | Create a new task for a Hermes worker |
| `kanban_complete` | Mark task done with handoff summary |
| `kanban_block` | Block task pending input |
| `kanban_comment` | Add comment to task thread |
| `kanban_link` | Create parent→child dependency |
| `kanban_heartbeat` | Send heartbeat to prevent stale detection |
| `kanban_reclaim` | Take over a stuck task |
| `kanban_boards` | List available boards |
| `kanban_profiles` | List available Hermes profiles (workers) |
| `kanban_worker_context` | Get current task context (when running as worker) |

### Commands

| Command | Description |
|---------|-------------|
| `/kanban-board` | Quick board overview |
| `/kanban-stats` | Quick stats display |
| `/kanban-web` | Open Hermes dashboard in browser |
| `/kanban-switch [board]` | Switch the active board |

## Installation

### One-Line Install (Recommended)

```bash
pi install git:github.com/Changhochien/hermes-kanban-pi-extension
```

That's it! Pi handles dependencies and building automatically.

## Usage

### As Orchestrator

```bash
# List available agents/profiles
pi "What Hermes profiles are available?"

# List ready tasks
pi "What tasks are ready for work?"

# Create a task for a specific agent
pi "Create a task for the researcher to analyze competitors"

# Create a task, let pi pick the right agent
pi "Create a task to write unit tests. Figure out which agent is best suited."

# Monitor board
pi "Show me the current kanban board"

# Link tasks for pipeline
pi "Create a research task and link it to the synthesis task"
```

**Orchestrator Workflow:**
1. `kanban_profiles` — Discover available agents
2. `kanban_list` — See what tasks exist and who's assigned
3. `kanban_create` — Delegate work to a specific agent
4. `kanban_link` — Set up dependencies between tasks
5. `kanban_diagnostics` — Monitor for stuck tasks

### As Worker

When launched with `HERMES_KANBAN_TASK=t_abc123`, the extension automatically:
- Injects task context into the system prompt
- Detects completion signals and suggests `kanban_complete`
- Provides `kanban_worker_context` tool for self-awareness

```bash
# Launch as Hermes worker
HERMES_KANBAN_TASK=t_abc123 pi --mode json

# Send heartbeat during long operations
pi "Send a heartbeat for my current task"
```

### Multi-Board

```bash
# List available boards
pi "What boards are available?"

# Switch board
/kanban-switch research

# Use specific board in any tool
pi "List the ready tasks on the production board"
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `HERMES_HOME` | `~/.hermes` | Hermes config directory |
| `HERMES_KANBAN_BOARD` | `default` | Default board name |
| `HERMES_KANBAN_TASK` | — | Current task ID (set by Hermes) |
| `HERMES_KANBAN_AUTO_COMPLETE` | `0` | Auto-complete on detection (not recommended) |

## Architecture

```
src/
├── index.ts              # Extension entry + lifecycle hooks
├── service/
│   ├── KanbanService.ts  # Facade (all operations)
│   ├── KanbanServiceFactory.ts  # Per-board cache
│   ├── ReadRepo.ts      # SQLite reads
│   └── WriteRepo.ts     # CLI writes
├── db/
│   └── connection.ts    # Per-board connection pool
├── cli/
│   └── parser.ts        # CLI output parsing
├── tools/               # 14 tools
├── commands/            # 4 commands
└── utils/
    ├── errors.ts         # Error types
    ├── truncate.ts       # Output truncation
    └── board-resolve.ts  # Board path resolution
```

## License

MIT
