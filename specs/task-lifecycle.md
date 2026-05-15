# Task Lifecycle State Machine

Visual reference for Hermes Kanban task states and transitions.

## State Diagram

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│ triage  │───►│  todo   │───►│  ready  │───►│ running │  │
└─────────┘    └─────────┘    └─────────┘    └────┬────┘  │
    │              │              │                │       │
    │              │              │                │       │
    ▼              ▼              ▼                ▼       │
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│archived │    │archived │    │ blocked │    │  done   │  │
└─────────┘    └─────────┘    └────┬────┘    └─────────┘  │
                                  │                ▲       │
                                  │                │       │
                                  └────────────────┴───────┘
                                         (reopen)
```

## State Descriptions

### triage
Tasks in initial review. May need specification work before accepting.

**Enter:** Task created with `--triage` flag  
**Exit:** 
- Promote to `todo` after specification
- Archive if invalid

### todo
Ready for work but not yet queued. Waiting for explicit scheduling.

**Enter:** Task created, or promoted from triage  
**Exit:**
- Move to `ready` for dispatch
- Archive if cancelled

### ready
Queued for dispatch. Dispatcher will pick up on next tick.

**Enter:** Manual move from todo, or parent completion  
**Exit:**
- Claimed by dispatcher → `running`
- Manual move to `todo` or `blocked`
- Archive if cancelled

### running
Worker actively processing the task.

**Enter:** Dispatcher spawns worker and claims task  
**Exit:**
- Complete successfully → `done`
- Block for input → `blocked`
- Fail/timeout → stays, worker retires
- Reclaim by operator → `ready`

### blocked
Waiting for external input (human, resource, dependency).

**Enter:** Worker calls `kanban_block`  
**Exit:**
- Operator unblocks → `ready`
- Archive if cancelled

### done
Task completed successfully.

**Enter:** Worker calls `kanban_complete`  
**Exit:**
- Reopen to `ready` (rare)
- Archive for cleanup

### archived
Soft-deleted. Hidden from default views.

**Enter:** Manual archive action  
**Exit:** (terminal state)

## Transition Rules

### Dependency Gating

Child tasks with parents will not promote to `ready` until ALL parents are `done`.

```
Parent A ────────┐
                 ├──► Child ──► (stays in todo until parents done)
Parent B ────────┘
```

### Claim Lifecycle

When `running`:
1. Dispatcher sets `claim_lock` and `claim_expires`
2. Worker sends periodic heartbeats to extend claim
3. If claim expires, dispatcher can reclaim
4. On completion, claim is released

### Hallucination Gate

When completing with `created_cards`:
1. System verifies each ID exists in database
2. System verifies each was created by THIS worker
3. If any fail verification, completion is BLOCKED
4. Worker can retry with corrected IDs or empty list

## State Transitions via Tools

| Tool | From | To |
|------|------|-----|
| create (triage=false) | - | todo |
| create (triage=true) | - | triage |
| specify | triage | todo |
| assign | any | (changes assignee only) |
| dispatch | ready | running |
| complete | running | done |
| block | running | blocked |
| unblock | blocked | ready |
| reclaim | running | ready |
| archive | any | archived |

## Auto-Promotion Rules

1. **Parent completion:** When all parents reach `done`, children auto-promote to `ready`
2. **Triage specification:** Specifier LLM promotes `triage` → `todo`
3. **Dispatcher tick:** Claims `ready` tasks and spawns workers

## Error States

### Zombie Detection
Tasks in `running` with no active worker (PID not found, no recent heartbeat) are flagged by diagnostics.

### Repeated Failures
Tasks with 3+ failed run attempts are flagged for review.

### Hallucinated References
Tasks that complete with non-existent `created_cards` are blocked and audited.
