# Hermes Kanban Pi Extension — Product Requirements Document

**Version:** 1.1.0  
**Status:** Revised  
**Date:** 2026-05-15  
**Author:** Research Team

---

## 1. Overview

### 1.1 Problem Statement

The Hermes multi-agent Kanban board (`hermes kanban`) provides a durable, SQLite-backed task coordination system for multi-agent workflows. However, it's currently only accessible via:

1. **CLI** (`hermes kanban create/list/show/complete...`)
2. **Dashboard** (web UI at `localhost:3000/kanban`)
3. **Agent Tools** (Python tools registered to Hermes worker agents)

**Missing:** Integration with pi agent (the coding harness) so that pi can:
- Create kanban tasks for Hermes workers
- Monitor and read the Kanban board
- Update task status based on work completed
- Orchestrate multi-agent workflows across both platforms

### 1.2 Solution

A pi agent Extension that bridges pi with the Hermes Kanban system, enabling pi to:

1. **Read** the Kanban board state (tasks, status, assignees)
2. **Create** new tasks for Hermes workers to pick up
3. **Update** task status (complete, block, heartbeat)
4. **Comment** on tasks for handoff communication
5. **Link** tasks for dependency management
6. **Query** diagnostics and task health

### 1.3 Scope

| In Scope | Out of Scope |
|----------|--------------|
| Read board state | Modifying Hermes core |
| Create/update tasks | Dashboard UI changes |
| Comment threads | Dispatcher configuration |
| Dependency links | Worker process spawning |
| Board diagnostics | Platform notifications |

---

## 2. Technical Architecture

### 2.1 System Context

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              pi agent                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                     hermes-kanban Extension                            │  │
│  │                                                                       │  │
│  │  ┌─────────────┐    ┌─────────────────┐    ┌────────────────────┐    │  │
│  │  │  Session    │    │  KanbanService  │    │  ToolRegistry      │    │  │
│  │  │  Lifecycle  │───▶│  (Facade)      │───▶│  (pi.registerTool) │    │  │
│  │  └─────────────┘    └────────┬────────┘    └────────────────────┘    │  │
│  │                               │                                      │  │
│  │         ┌────────────────────┼────────────────────┐                 │  │
│  │         ▼                    ▼                    ▼                 │  │
│  │  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐           │  │
│  │  │ ReadRepo     │   │ WriteRepo   │   │ BoardCache   │           │  │
│  │  │ (SQLite)     │   │ (CLI)       │   │ (Memory)     │           │  │
│  │  └──────┬───────┘   └──────┬───────┘   └──────────────┘           │  │
│  └─────────┼───────────────────┼─────────────────────────────────────────┘  │
└────────────┼───────────────────┼───────────────────────────────────────────────┘
             │                   │
             ▼                   ▼
    ┌────────────────┐  ┌────────────────┐
    │  SQLite DB     │  │ hermes CLI     │
    │  (reads)       │  │ (writes)       │
    └────────────────┘  └────────────────┘
```

### 2.2 Data Access Strategy

**Read Path:** Direct SQLite via `better-sqlite3`
- Fastest, no external dependencies
- All read operations use parameterized queries (SQL injection safe)
- Per-board connection pooling

**Write Path:** CLI subprocess via `hermes kanban ...`
- Reuses Hermes' battle-tested transaction/event logic
- Preflight validation via SQLite before CLI call
- Uses `execFile` (not `exec`) to avoid shell injection

**Key Design Principles:**
1. **KanbanService Facade** — Tools call `service.listTasks()` without knowing the backend
2. **ReadRepo / WriteRepo split** — Clear separation of concerns
3. **Preflight validation** — Read-before-write for better UX
4. **Session lifecycle hooks** — Connect on start, close on shutdown
5. **Output truncation** — 50KB/2000 lines enforced per pi requirements

### 2.3 Kanban Data Model

```
tasks
├── id              TEXT PRIMARY KEY (t_<hex8>)
├── title           TEXT NOT NULL
├── body            TEXT
├── status           TEXT DEFAULT 'triage'
├── assignee         TEXT
├── tenant           TEXT
├── priority         INTEGER DEFAULT 0
├── workspace_kind   TEXT DEFAULT 'scratch'
├── workspace_path   TEXT
├── created_by       TEXT
├── created_at       INTEGER (unix timestamp)
├── started_at       INTEGER
├── completed_at     INTEGER
├── result           TEXT
└── current_run_id   INTEGER

task_links
├── parent_id        TEXT → tasks.id
└── child_id        TEXT → tasks.id

task_comments
├── id              INTEGER PRIMARY KEY
├── task_id         TEXT → tasks.id
├── author          TEXT
├── body            TEXT
└── created_at      INTEGER

task_events
├── id              INTEGER PRIMARY KEY
├── task_id         TEXT → tasks.id
├── run_id          INTEGER
├── kind            TEXT
├── payload         TEXT (JSON)
└── created_at      INTEGER

task_runs
├── id              INTEGER PRIMARY KEY
├── task_id         TEXT → tasks.id
├── profile         TEXT
├── status          TEXT
├── outcome         TEXT
├── summary         TEXT
└── ...
```

### 2.4 Task Lifecycle

```
triage ──► todo ──► ready ──► running ──┬──► done
     │         │        │        │      │
     │         │        │        ▼      │
     │         │        │    blocked ◄──┘
     │         │        │        │
     │         │        │        ▼
     │         │        └──── unblock
     │         │                 │
     ▼         ▼                 │
   archive ◄────────────────────┘
```

---

## 3. Feature Requirements

### 3.1 Core Features

#### F1: kanban_list — Board Reader

**Purpose:** View tasks across the board with filtering

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `status` | enum | No | all | Filter by status |
| `assignee` | string | No | - | Filter by profile |
| `tenant` | string | No | - | Filter by tenant |
| `limit` | int | No | 50 | Max results (max 200) |

**Output:**
```json
{
  "tasks": [
    {
      "id": "t_12345678",
      "title": "Research competitor analysis",
      "status": "ready",
      "assignee": "researcher-a",
      "priority": 10,
      "parent_count": 1,
      "child_count": 3
    }
  ],
  "count": 1,
  "truncated": false
}
```

**Tool Definition:**
```typescript
{
  name: "kanban_list",
  description: "List Hermes Kanban tasks with optional status/assignee filters. Returns compact task summaries with id, title, status, assignee, priority, and parent/child counts.",
  parameters: {
    status?: "triage" | "todo" | "ready" | "running" | "blocked" | "done" | "archived",
    assignee?: string,
    tenant?: string,
    limit?: number
  }
}
```

#### F2: kanban_board — Visual Board Overview

**Purpose:** Get the full board state grouped by column

**Output:**
```json
{
  "columns": [
    {
      "name": "triage",
      "tasks": [...]
    },
    {
      "name": "todo", 
      "tasks": [...]
    }
  ],
  "stats": {
    "total": 25,
    "by_status": {"triage": 5, "todo": 10, "ready": 3, "running": 2, "blocked": 1, "done": 4}
  }
}
```

**Tool Definition:**
```typescript
{
  name: "kanban_board",
  description: "Get the full Kanban board grouped by status column. Returns tasks organized by triage/todo/ready/running/blocked/done with board statistics.",
  parameters: {}
}
```

#### F3: kanban_show — Task Detail Viewer

**Purpose:** Deep dive into a specific task

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `task_id` | string | Yes | Task ID (t_<hex8>) |

**Output:**
```json
{
  "task": {
    "id": "t_12345678",
    "title": "Research competitor analysis",
    "body": "Full task description...",
    "status": "running",
    "assignee": "researcher-a",
    "created_at": 1715000000,
    "started_at": 1715000100,
    "current_run_id": 42
  },
  "parents": ["t_11111111"],
  "children": ["t_22222222", "t_33333333"],
  "comments": [
    {"author": "researcher-a", "body": "Finding X...", "created_at": 1715000200}
  ],
  "events": [
    {"kind": "created", "created_at": 1715000000},
    {"kind": "status", "payload": {"status": "running"}, "created_at": 1715000100}
  ],
  "runs": [
    {"id": 42, "profile": "researcher-a", "status": "running", "started_at": 1715000100}
  ]
}
```

**Tool Definition:**
```typescript
{
  name: "kanban_show",
  description: "Get full details of a task including body, comments, events, and run history. Use this to understand task context before starting work.",
  parameters: {
    task_id: string
  }
}
```

#### F4: kanban_create — Task Creator

**Purpose:** Create new tasks for Hermes workers

**Parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `title` | string | Yes | - | Task title |
| `assignee` | string | Yes | - | Worker profile name |
| `body` | string | No | - | Full task description |
| `priority` | int | No | 0 | Priority (higher = sooner) |
| `parents` | string[] | No | [] | Parent task IDs |
| `workspace_kind` | enum | No | scratch | scratch/dir/worktree |
| `workspace_path` | string | No | - | For dir/worktree kinds |
| `triage` | bool | No | false | Start in triage status |
| `skills` | string[] | No | - | Skills to load in worker |

**Output:**
```json
{
  "ok": true,
  "task_id": "t_87654321",
  "status": "todo"
}
```

**Tool Definition:**
```typescript
{
  name: "kanban_create",
  description: "Create a new task on the Hermes Kanban board. The task will be picked up by the assigned worker profile on the dispatcher's next tick. Use for fanning out work to specialized Hermes agents.",
  parameters: {
    title: string,
    assignee: string,
    body?: string,
    priority?: number,
    parents?: string[],
    workspace_kind?: "scratch" | "dir" | "worktree",
    workspace_path?: string,
    triage?: boolean,
    skills?: string[]
  }
}
```

#### F5: kanban_complete — Task Completion

**Purpose:** Mark a task as done with handoff summary

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `task_id` | string | No* | Task ID (defaults to HERMES_KANBAN_TASK env) |
| `summary` | string | Yes* | 1-3 sentence handoff description |
| `metadata` | object | No | Structured facts about the work |
| `result` | string | No | Legacy result line |
| `created_cards` | string[] | No | IDs of tasks created during work |

**Output:**
```json
{
  "ok": true,
  "task_id": "t_12345678",
  "run_id": 42
}
```

**Error Cases:**
- Unknown task_id → `{"error": "task not found"}`
- Phantom created_cards → `{"error": "kanban_complete blocked: card X does not exist"}`
- Already terminal → `{"error": "task already completed"}`

**Tool Definition:**
```typescript
{
  name: "kanban_complete",
  description: "Mark a task as completed with a structured handoff summary. The summary appears in downstream worker context and dashboard. Include metadata about what was done.",
  parameters: {
    task_id?: string,
    summary?: string,
    metadata?: Record<string, unknown>,
    result?: string,
    created_cards?: string[]
  }
}
```

#### F6: kanban_block — Task Blocker

**Purpose:** Block a task pending human input

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `task_id` | string | No* | Task ID |
| `reason` | string | Yes | What input is needed |

**Output:**
```json
{
  "ok": true,
  "task_id": "t_12345678",
  "run_id": 42
}
```

**Tool Definition:**
```typescript
{
  name: "kanban_block",
  description: "Block a task because you need human input to proceed. The reason is shown on the board and in context when someone unblocks the task.",
  parameters: {
    task_id?: string,
    reason: string
  }
}
```

#### F7: kanban_comment — Task Communicator

**Purpose:** Add threaded comments for handoff

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `task_id` | string | Yes | Target task |
| `body` | string | Yes | Comment text (markdown supported) |

**Output:**
```json
{
  "ok": true,
  "task_id": "t_12345678",
  "comment_id": 99
}
```

**Tool Definition:**
```typescript
{
  name: "kanban_comment",
  description: "Add a comment to a task's thread. Comments are included in downstream worker context. Use for notes, questions, or findings that should outlive this run.",
  parameters: {
    task_id: string,
    body: string
  }
}
```

#### F8: kanban_link — Dependency Manager

**Purpose:** Create parent→child dependency edges

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `parent_id` | string | Yes | Parent task ID |
| `child_id` | string | Yes | Child task ID |

**Output:**
```json
{
  "ok": true,
  "parent_id": "t_11111111",
  "child_id": "t_22222222"
}
```

**Error Cases:**
- Cycle detected → `{"error": "cycle detected"}`
- Self-link → `{"error": "cannot link task to itself"}`

**Tool Definition:**
```typescript
{
  name: "kanban_link",
  description: "Create a parent→child dependency link. The child task won't promote to 'ready' until all parents are 'done'. Use for sequencing related tasks.",
  parameters: {
    parent_id: string,
    child_id: string
  }
}
```

#### F9: kanban_diagnostics — Health Checker

**Purpose:** Identify distressed tasks

**Output:**
```json
{
  "diagnostics": [
    {
      "task_id": "t_12345678",
      "task_title": "Research analysis",
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

**Tool Definition:**
```typescript
{
  name: "kanban_diagnostics",
  description: "Check all tasks for distress signals: stale running tasks, repeated failures, hallucinated card references, spawn failures. Returns actionable warnings.",
  parameters: {
    severity?: "warning" | "error" | "critical"
  }
}
```

#### F10: kanban_stats — Board Metrics

**Purpose:** Quick board health overview

**Output:**
```json
{
  "by_status": {
    "triage": 3,
    "todo": 12,
    "ready": 5,
    "running": 2,
    "blocked": 1,
    "done": 47
  },
  "by_assignee": {
    "researcher-a": 8,
    "coder-b": 5,
    "reviewer-c": 3
  },
  "oldest_ready_age_seconds": 3600
}
```

**Tool Definition:**
```typescript
{
  name: "kanban_stats",
  description: "Get board statistics: task counts by status, tasks per assignee, and age of oldest ready task. Useful for workload balancing.",
  parameters: {}
}
```

### 3.2 Command-Line Features

#### C1: /kanban-board

**Purpose:** Quick board overview in TUI

**Output:** Formatted table of tasks by column

```
📋 Kanban Board — 25 tasks

triage (3)     │ todo (12)    │ ready (5)    │ running (2)
───────────────┼──────────────┼──────────────┼─────────────
t_abc Research │ t_def Build  │ t_ghi Test   │ t_jkl Deploy
    X Research│    Y API     │              │

blocked (1)    │ done (47)
──────────────┼─────────────
t_mno Waiting │ t_pqr Shipped
```

#### C2: /kanban-stats

**Purpose:** Quick metrics display

**Output:** Compact stats summary

### 3.3 Event Integration (Future)

| Event | Handler | Action |
|-------|---------|--------|
| `tool_result` | kanban_complete | Auto-add completion comment |
| `session_start` | - | Notify of assigned tasks |
| `before_agent_start` | - | Inject pending task context |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Target |
|--------|--------|
| List query latency | < 50ms |
| Show query latency | < 30ms |
| Create latency | < 100ms |
| Extension load time | < 500ms |

### 4.2 Reliability

- **DB connection pooling:** Single persistent connection
- **Error handling:** Graceful degradation if DB unavailable
- **Idempotency:** Create with idempotency keys where supported

### 4.3 Security

| Concern | Mitigation |
|---------|------------|
| DB file permissions | Read-only operations where possible |
| SQL injection | Parameterized queries only |
| Task ownership | Respect Hermes worker scoping |

### 4.4 Compatibility

- **Pi versions:** 1.x (current)
- **Hermes versions:** 0.12+ (kanban feature introduced)
- **Node versions:** 18+ (better-sqlite3 requirement)

---

## 5. User Stories

### US1: Pi Creates Task for Hermes Worker

**Actor:** pi agent user  
**Trigger:** User asks pi to delegate a task  
**Flow:**
1. User: "Create a task for the researcher to analyze competitors"
2. pi calls `kanban_create(title="Competitor analysis", assignee="researcher", body="...")`
3. Task created in `todo` status
4. Dispatcher picks it up, spawns researcher worker
5. Worker reports progress via comments

### US2: Pi Monitors Board Progress

**Actor:** pi agent user  
**Trigger:** User wants status update  
**Flow:**
1. User: "Show me the current board"
2. pi calls `kanban_board()`
3. Returns formatted board state
4. User can drill down with `kanban_show(id)`

### US3: Pi Completes Work and Handoffs

**Actor:** pi agent (working as Hermes worker)  
**Trigger:** pi finishes assigned work  
**Flow:**
1. pi completes analysis
2. Calls `kanban_complete(task_id, summary="...", metadata={...})`
3. Creates follow-up tasks via `kanban_create(parents=[task_id])`
4. Child tasks auto-promote when parent done

### US4: Pi Recovers from Blocked Task

**Actor:** pi agent user  
**Trigger:** Task blocked, user wants to unblock  
**Flow:**
1. User: "Why is task X blocked?"
2. pi calls `kanban_show(task_id)` → sees `blocked` status + reason
3. User provides needed info
4. pi calls `kanban_comment(task_id, body="Answer: ...")`
5. User: "Unblock it"
6. pi shells to `hermes kanban unblock <task_id>` (CLI for write)

### US5: pi Coordinates Multi-Agent Pipeline

**Actor:** pi agent user  
**Trigger:** Complex pipeline needed  
**Flow:**
1. User: "Research → Synthesize → Review pipeline"
2. pi creates: research task (assignee: researcher)
3. pi creates: synthesis task (assignee: synthesizer, parents: research)
4. pi creates: review task (assignee: reviewer, parents: synthesis)
5. Tasks auto-sequence as parents complete
6. pi monitors via `kanban_list(status=done)`

---

## 6. Design Decisions

### 6.1 Why SQLite over HTTP?

| Factor | SQLite | HTTP |
|--------|--------|------|
| Speed | ~10x faster | Requires dashboard |
| Availability | Always | Needs service |
| Transactions | Full support | Partial |
| Dependencies | better-sqlite3 | hermes running |

**Decision:** SQLite primary, HTTP fallback for dashboard-specific features.

### 6.2 Why CLI for Writes?

Hermes kanban writes involve:
- Transaction management
- Event logging
- Run lifecycle updates
- Hallucination verification

The CLI (`hermes kanban create/complete/...`) is battle-tested for these. Implementing in TypeScript risks divergence.

**Decision:** Read via SQLite, write via CLI subprocess.

### 6.3 Tool Naming Convention

Follow Hermes naming: `kanban_<verb>` for consistency with Hermes agent tools.

### 6.4 Error Format

All tools return structured error responses:

```typescript
interface Result<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: KanbanErrorCode;
}

enum KanbanErrorCode {
  TASK_NOT_FOUND = "TASK_NOT_FOUND",
  ASSIGNEE_NOT_FOUND = "ASSIGNEE_NOT_FOUND",
  CLI_NOT_FOUND = "CLI_NOT_FOUND",
  CLI_ERROR = "CLI_ERROR",
  DB_ERROR = "DB_ERROR",
  CYCLE_DETECTED = "CYCLE_DETECTED",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  HALLUCINATED_CARDS = "HALLUCINATED_CARDS",
  ALREADY_COMPLETED = "ALREADY_COMPLETED",
}
```

Tool output format:
```json
{
  "content": [{ "type": "text", "text": "Error: task not found" }],
  "details": { "tool": "kanban_show", "error": "task not found", "code": "TASK_NOT_FOUND" }
}
```

---

## 7. Project Structure

```
hermes-kanban-pi-extension/
├── package.json              # Project metadata + deps
├── tsconfig.json             # TypeScript config
├── src/
│   ├── index.ts              # Extension entry + lifecycle hooks
│   ├── types/
│   │   └── index.ts         # Shared TypeScript interfaces
│   ├── service/
│   │   ├── KanbanService.ts # Facade (orchestrates reads + writes)
│   │   ├── ReadRepo.ts      # SQLite read operations
│   │   └── WriteRepo.ts     # CLI write ops + preflight validation
│   ├── db/
│   │   └── connection.ts     # Per-board connection pool
│   ├── cli/
│   │   ├── runner.ts        # CLI subprocess (execFile, not exec)
│   │   └── parser.ts       # CLI output parsing
│   ├── tools/               # One file per tool
│   │   ├── list.ts          # kanban_list
│   │   ├── board.ts         # kanban_board
│   │   ├── show.ts          # kanban_show
│   │   ├── create.ts        # kanban_create
│   │   ├── complete.ts      # kanban_complete
│   │   ├── block.ts         # kanban_block
│   │   ├── comment.ts        # kanban_comment
│   │   ├── link.ts           # kanban_link
│   │   ├── diagnostics.ts    # kanban_diagnostics
│   │   └── stats.ts         # kanban_stats
│   ├── commands/             # /slash commands
│   │   ├── board.ts          # /kanban-board
│   │   └── stats.ts         # /kanban-stats
│   └── utils/
│       ├── errors.ts         # Structured error types
│       ├── truncate.ts       # Output truncation (50KB/2000 lines)
│       └── board-resolve.ts  # Board path resolution
├── docs/
│   ├── README.md            # User documentation
│   ├── API.md               # Tool reference
│   └── ARCHITECTURE.md      # Technical architecture
├── skills/
│   └── SKILL.md              # Pi skill reference
└── specs/
    ├── database-schema.md   # DB schema reference
    └── task-lifecycle.md     # State machine docs
```

---

## 8. Milestones

| Milestone | Deliverables | Status |
|-----------|--------------|--------|
| M1: Core DB Access | SQLite connection, per-board pooling | ✅ Complete |
| M2: Read Tools | list, board, show, diagnostics, stats | ✅ Complete |
| M3: Write Tools | create, complete, block, comment, link | ✅ Complete |
| M4: Commands | /kanban-board, /kanban-stats | ✅ Complete |
| M5: Error Handling | KanbanError, Result type, truncation | ✅ Complete |
| M6: Architecture | KanbanService facade, ReadRepo, WriteRepo | ✅ Complete |
| M7: Lifecycle | session_start/shutdown hooks | ✅ Complete |
| M8: Documentation | README, API ref, architecture | ✅ Complete |

---

## 9. Open Questions

| # | Question | Decision Needed |
|---|----------|----------------|
| Q1 | Should pi auto-detect Hermes home path or require config? | Config first |
| Q2 | How to handle multiple boards? | Support board param on all tools |
| Q3 | Should extension subscribe to WebSocket events? | Future work |
| Q4 | Cache board state? | No caching initially |
| Q5 | Hermes version compatibility checks? | Warn only |

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| All 10 tools functional | 100% |
| Read operation success rate | > 99% |
| Write operation success rate | > 98% |
| Extension load time | < 500ms |
| Documentation coverage | All tools documented |

---

## Appendix A: Hermes Kanban CLI Reference

```bash
# List tasks
hermes kanban list [--status STATUS] [--assignee PROFILE] [--limit N]

# Show task
hermes kanban show <task_id>

# Create task
hermes kanban create --title "..." --assignee <profile>

# Complete task
hermes kanban complete <task_id> --summary "..."

# Block task
hermes kanban block <task_id> --reason "..."

# Unblock task
hermes kanban unblock <task_id>

# Add comment
hermes kanban comment <task_id> --body "..."

# Link tasks
hermes kanban link --parent <id> --child <id>

# Board stats
hermes kanban stats

# Diagnostics
hermes kanban diagnostics

# Board management
hermes kanban boards list
hermes kanban boards create <slug>
hermes kanban boards switch <slug>
```

---

## Appendix B: Database Location Reference

| Environment | Default Path |
|-------------|--------------|
| Standard | `~/.hermes/kanban.db` |
| Docker | `HERMES_HOME/kanban.db` |
| Custom root | `$HERMES_KANBAN_HOME/kanban.db` |

Board DBs: `~/.hermes/kanban/boards/<slug>/kanban.db`
