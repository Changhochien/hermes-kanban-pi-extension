# Hermes Kanban Pi Extension

A [pi agent](https://pi.dev) extension that integrates with the [Hermes multi-agent Kanban board](https://github.com/NousResearch/hermes-agent) for task coordination.

## Features

- **Read the Kanban board** — List tasks, view board columns, get task details
- **Create tasks** — Delegate work to Hermes worker agents
- **Update status** — Complete tasks, block pending input, add comments
- **Dependency management** — Link parent→child tasks for pipelines
- **Diagnostics** — Identify distressed tasks (stale, failing, hallucinated)

## Installation

### One-Liner (Recommended)

```bash
curl -sL https://raw.githubusercontent.com/YOUR_USER/hermes-kanban-pi-extension/main/install.sh | bash
```

### Manual Install

```bash
# Clone to pi extensions directory
git clone https://github.com/YOUR_USER/hermes-kanban-pi-extension.git \
  ~/.pi/agent/extensions/hermes-kanban

# Install dependencies and build
cd ~/.pi/agent/extensions/hermes-kanban
npm install && npm run build
```

### Using degit

```bash
npx degit YOUR_USER/hermes-kanban-pi-extension ~/.pi/agent/extensions/hermes-kanban
cd ~/.pi/agent/extensions/hermes-kanban
npm install && npm run build
```

> ⚠️ After installing, restart pi agent to load the extension.

## Available Tools

| Tool | Description |
|------|-------------|
| `kanban_list` | List tasks with filters (status, assignee, tenant) |
| `kanban_board` | Get full board grouped by column |
| `kanban_show` | Get detailed task info (body, comments, events, runs) |
| `kanban_create` | Create a new task for a Hermes worker |
| `kanban_complete` | Mark task done with handoff summary |
| `kanban_block` | Block task pending human input |
| `kanban_comment` | Add comment to task thread |
| `kanban_link` | Create parent→child dependency |
| `kanban_diagnostics` | Check for task health issues |
| `kanban_stats` | Get board statistics |

## Available Commands

| Command | Description |
|---------|-------------|
| `/kanban-board` | Quick board overview |
| `/kanban-stats` | Quick stats display |

## Configuration

The extension auto-detects the Hermes Kanban database at:
- `~/.hermes/kanban.db` (default board)
- `~/.hermes/kanban/boards/<slug>/kanban.db` (multi-board)

Set `HERMES_HOME` environment variable for custom paths.

## Usage Examples

### Create a Task

```
pi > Create a task for the researcher to analyze competitors

pi will call: kanban_create(
  title="Competitor analysis",
  assignee="researcher",
  body="Find and analyze top 5 competitors..."
)
```

### View the Board

```
pi > What's on the kanban board?

pi will call: kanban_board()
Returns: Tasks grouped by status column with stats
```

### Complete with Handoff

```
pi > I'm done with the analysis

pi will call: kanban_complete(
  task_id="t_12345678",
  summary="Completed competitor analysis with key findings",
  metadata={"competitors_found": 5, "documents_reviewed": 20}
)
```

## Requirements

- Node.js 18+
- pi agent 1.x
- Hermes agent 0.12+ (with kanban feature)
- `better-sqlite3` npm package

## Architecture

See [PRD.md](./PRD.md) for full technical specification.

## License

MIT
