# Hermes Kanban Pi Extension v2 — Product Requirements Document

**Version:** 2.0.0  
**Status:** Draft  
**Date:** 2026-05-15  
**Depends on:** v1.1.0 (all 10 tools + 2 commands implemented)

---

## 1. Overview

v1.1.0 gave pi the ability to *orchestrate* Hermes workers — create tasks, monitor boards, link dependencies. What's missing: pi can't be a **first-class Hermes worker**, and it can't operate across multiple boards. v2 closes both gaps.

### 1.1 What v2 adds

| Capability | v1.1.0 | v2 |
|------------|--------|-----|
| Pi as orchestrator (create, monitor, coordinate) | ✅ | ✅ |
| Pi as worker (pick up + complete tasks with awareness) | ❌ | ✅ |
| Multi-board support (board param on all tools) | ❌ | ✅ |
| Worker health tools (heartbeat, reclaim) | ❌ | ✅ |
| Dashboard-aligned commands (web, board switch) | ❌ | ✅ |

### 1.2 Non-goals

- Real-time WebSocket events from the Hermes dashboard (future)
- Multi-board transactions across separate SQLite DBs (future)
- Replacing the Hermes dispatcher or worker spawning logic

---

## 2. Feature Requirements

### 2.1 F11: Pi as Worker — Auto-Context Injection

**Problem:** When pi is launched as a Hermes worker (`HERMES_KANBAN_TASK=t_abc123`), the LLM has no idea what task it's working on unless it manually calls `kanban_show`. This wastes tool calls and token budget.

**Solution:** A `before_agent_start` hook that detects the `HERMES_KANBAN_TASK` env var, reads the task from SQLite, and injects the task description + comments + parent context into the system prompt.

```
Hermes dispatcher:
  $ HERMES_KANBAN_TASK=t_abc123 pi --mode json -p "Do the thing"

pi (before_agent_start):
  reads task t_abc123 from ~/.hermes/kanban.db
  injects into system prompt:
    ┌─────────────────────────────────────────────
    │ [HERMES WORKER CONTEXT]
    │ Task: t_abc123 — "Research competitor pricing"
    │ Status: ready
    │ Description: Find and analyze top 5 competitors...
    │ Parents: t_parent (done)
    │ Comments:
    │   @orchestrator: "Focus on SaaS, ignore enterprise"
    │ Run history: 0 previous attempts
    │ 
    │ When finished: call kanban_complete(summary="...")
    │ If blocked: call kanban_block(reason="...")
    └─────────────────────────────────────────────
```

**Behavior:**
- Only activates when `HERMES_KANBAN_TASK` is set
- Reads once at `before_agent_start`, not per-turn
- If task not found or DB unavailable: warns but proceeds (no blocking)
- Exposes a new tool `kanban_worker_context` that returns the same info on demand

**Implementation:** One `before_agent_start` handler in `index.ts`, 30 lines.

---

### 2.2 F12: Pi as Worker — Auto-Completion Detection

**Problem:** The LLM might finish work but forget to call `kanban_complete`. The task appears "running" forever.

**Solution:** A `turn_end` handler that scans the assistant's last response for completion signals and warns if the LLM seems done but hasn't called `kanban_complete`.

**Signals detected:**
- "Done", "Complete", "Finished", "All done"
- Returned final structured output without creating follow-up tasks
- Error/failure language ("Can't proceed", "Failed", "Unable to")

**Behavior:**
- If signal detected + `kanban_complete` not called in this turn → inject a steer message: "You appear to be done. Should I call kanban_complete() with a summary?"
- Does NOT auto-complete — always asks the LLM to confirm
- Configurable via env: `HERMES_KANBAN_AUTO_COMPLETE=1` to skip confirmation

**Implementation:** One `turn_end` handler, 40 lines.

---

### 2.3 F13: Board Parameter on All Tools

**Problem:** All tools operate on a single board set at extension load time. The PRD Q2 flagged multi-board as "decision needed" but it was never implemented.

**Solution:** Add an optional `board` parameter to every tool. When absent, uses the current board (env var or default).

```typescript
// Before
kanban_list({ status: "ready" })

// After  
kanban_list({ status: "ready" })                    // current board
kanban_list({ status: "ready", board: "research" }) // specific board
```

**Tool changes (all 10 tools):**

| Tool | New param |
|------|-----------|
| `kanban_list` | `board?: string` |
| `kanban_board` | `board?: string` |
| `kanban_show` | `board?: string` |
| `kanban_stats` | `board?: string` |
| `kanban_diagnostics` | `board?: string` |
| `kanban_create` | `board?: string` (task is created on this board) |
| `kanban_complete` | `board?: string` |
| `kanban_block` | `board?: string` |
| `kanban_comment` | `board?: string` |
| `kanban_link` | `board?: string` |

**Service behavior:**
- `KanbanService` gets a `switchBoard(board: string)` method
- Or: `KanbanServiceFactory.get(board)` — caches service instances per board
- Both `ReadRepo` and `WriteRepo` are already board-aware (per-board connection pool exists)

**Implementation:** Per-board service cache + param plumbing on all tools, ~80 lines.

---

### 2.4 F14: kanban_heartbeat — Worker Health Ping

**Purpose:** Let pi (or any worker) send a heartbeat when doing long-running work, preventing stale-running detection.

**Tool:**
```typescript
kanban_heartbeat({ task_id?: string })
// task_id defaults to HERMES_KANBAN_TASK env var
```

**CLI equivalent:** `hermes kanban heartbeat <task_id>`

**Output:**
```json
{ "ok": true, "task_id": "t_abc123" }
```

**LLM guidelines:**
- "Use kanban_heartbeat every ~5 minutes during long operations"
- "Prevents the task from appearing stalled"

**Implementation:** One CLI call, 20 lines.

---

### 2.5 F15: kanban_reclaim — Take Over Stuck Task

**Purpose:** Reclaim a task that another worker abandoned. Useful when pi-as-orchestrator detects a stale task and wants to reassign it.

**Tool:**
```typescript
kanban_reclaim({ task_id: string, reason?: string })
```

**CLI equivalent:** `hermes kanban reclaim <task_id> [--reason "..."]`

**Preflight:** Checks task exists + is in `running` state.

**Output:**
```json
{ "ok": true, "task_id": "t_abc123" }
```

**LLM guidelines:**
- "Use kanban_reclaim when kanban_diagnostics shows a stale task"
- "Reclaim resets the task to 'ready' so another worker picks it up"

**Implementation:** One CLI call, 25 lines.

---

### 2.6 F16: kanban_boards — List Available Boards

**Purpose:** Discover what boards exist. Needed for multi-board workflows.

**Tool:**
```typescript
kanban_boards({}) → { boards: [{ slug: "default", path: "...", taskCount: 25 }, ...] }
```

**Reads from:** Filesystem (`~/.hermes/kanban/boards/*/kanban.db`) + default board.

**LLM guidelines:**
- "Use kanban_boards to discover available boards before switching"

**Implementation:** Filesystem scan + SQLite count per board, 35 lines.

---

### 2.7 F17: kanban_worker_context — Worker Self-Awareness

**Purpose:** Pi-as-worker explicitly reads its own task context. Redundant with auto-injection (F11) but useful as a fallback and for the LLM to refresh context mid-session.

**Tool:**
```typescript
kanban_worker_context({}) → TaskDetail
// reads HERMES_KANBAN_TASK env var
```

**Output:** Same as `kanban_show(task_id)` but uses env var. Includes extra fields:
- `worker_profile`: derived from run context
- `max_runtime_seconds`: how long before timeout

**LLM guidelines:**
- "Use kanban_worker_context to re-read your current task mid-session"
- "Your task context is also injected automatically at session start"

**Implementation:** Wraps `kanban_show` with env var lookup, 15 lines.

---

## 3. Commands

### 3.1 /kanban-web — Open Hermes Dashboard

```
/kanban-web → opens localhost:3000/kanban in browser
```

Uses `pi.exec("open", ["http://localhost:3000/kanban"])` or xdg-open.

### 3.2 /kanban-switch — Switch Active Board

```
/kanban-switch [board] → switches HERMES_KANBAN_BOARD for this session
```

Shows available boards via `/kanban-switch` with no arg. Switches on selection.

**Implementation:** 15 lines each.

---

## 4. Architecture Changes

### 4.1 Per-Board Service Cache

```typescript
// New in index.ts
const services = new Map<string, KanbanService>();

function getService(board?: string): KanbanService {
  const b = board || resolveBoard();
  if (!services.has(b)) {
    services.set(b, new KanbanService(b));
  }
  return services.get(b)!;
}
```

### 4.2 Event Hook Pipeline

```
session_start
  └─► if HERMES_KANBAN_TASK set: read task via SQLite, cache in memory

before_agent_start  
  └─► if cached task exists: inject worker context into system prompt
  
turn_end
  └─► scan assistant response for completion signals
  └─► if signal + no complete call: inject steer message
  
agent_end
  └─► if turn_end detected completion + LLM confirmed: auto-complete
  
session_shutdown
  └─► close all board connections
```

---

## 5. Tool Summary (v2 additions)

| Tool | Type | CLI backed? | Priority |
|------|------|-------------|----------|
| `kanban_heartbeat` | Write | Yes | High |
| `kanban_reclaim` | Write | Yes | High |
| `kanban_boards` | Read | No | Medium |
| `kanban_worker_context` | Read | No | Medium |

---

## 6. Migration from v1.1.0

All v1.1.0 tools retain identical signatures. The `board` parameter is **optional with default** — v1.1.0 behavior is unchanged when omitted.

No breaking changes.

---

## 7. Milestones

| Milestone | Deliverables | Lines |
|-----------|--------------|-------|
| M7: Worker Awareness | F11 (auto-context), F12 (auto-complete), F17 (worker_context) | ~85 |
| M8: Multi-Board | F13 (board param on all tools), F16 (kanban_boards), service cache | ~115 |
| M9: Worker Tools | F14 (heartbeat), F15 (reclaim) | ~45 |
| M10: Commands | /kanban-web, /kanban-switch | ~30 |
| M11: Polish | Truncation on new tools, error codes, docs update | ~50 |

**Total:** ~325 lines of new code. Estimated effort: 2-3 hours.

---

## 8. Success Metrics

| Metric | v1.1.0 | v2 Target |
|--------|--------|-----------|
| Tools available to LLM | 10 | 14 |
| Slash commands | 2 | 4 |
| Worker awareness | None | Auto-injected |
| Multi-board | None | Full support |
| Worker health tools | None | heartbeat + reclaim |
