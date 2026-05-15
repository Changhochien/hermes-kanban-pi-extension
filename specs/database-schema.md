# Hermes Kanban Database Schema

Reference documentation for the SQLite database schema used by Hermes Kanban.

## Database Location

| Environment | Path |
|-------------|------|
| Standard | `~/.hermes/kanban.db` |
| Docker | `$HERMES_HOME/kanban.db` |
| Multi-board | `~/.hermes/kanban/boards/<slug>/kanban.db` |

## Tables

### tasks

Main task table.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | TEXT | - | Primary key (t_\<hex8\>) |
| title | TEXT | - | Task title |
| body | TEXT | NULL | Full description |
| status | TEXT | 'triage' | Current status |
| assignee | TEXT | NULL | Assigned profile |
| tenant | TEXT | NULL | Tenant/project namespace |
| priority | INTEGER | 0 | Priority (higher = sooner) |
| workspace_kind | TEXT | 'scratch' | scratch/dir/worktree |
| workspace_path | TEXT | NULL | Path for dir/worktree |
| created_by | TEXT | - | Creator profile |
| created_at | INTEGER | - | Unix timestamp |
| started_at | INTEGER | NULL | When first claimed |
| completed_at | INTEGER | NULL | When marked done |
| result | TEXT | NULL | Result/legacy field |
| current_run_id | INTEGER | NULL | Active run reference |

### task_links

Parent→child dependency edges.

| Column | Type | Description |
|--------|------|-------------|
| parent_id | TEXT | Parent task ID → tasks.id |
| child_id | TEXT | Child task ID → tasks.id |

### task_comments

Threaded comments per task.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| task_id | TEXT | → tasks.id |
| author | TEXT | Commenter profile |
| body | TEXT | Comment content |
| created_at | INTEGER | Unix timestamp |

### task_events

Append-only event log.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| task_id | TEXT | → tasks.id |
| run_id | INTEGER | → task_runs.id |
| kind | TEXT | Event type |
| payload | TEXT | JSON event data |
| created_at | INTEGER | Unix timestamp |

### task_runs

Attempt/run history.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| task_id | TEXT | → tasks.id |
| profile | TEXT | Worker profile |
| step_key | TEXT | Step identifier |
| status | TEXT | Run status |
| claim_lock | TEXT | Claim identifier |
| claim_expires | INTEGER | Claim expiry |
| worker_pid | INTEGER | Process ID |
| max_runtime_seconds | INTEGER | Runtime cap |
| last_heartbeat_at | INTEGER | Last heartbeat |
| started_at | INTEGER | Run start |
| ended_at | INTEGER | Run end |
| outcome | TEXT | Exit outcome |
| summary | TEXT | Handoff summary |
| metadata | TEXT | JSON metadata |
| error | TEXT | Error message |

### notify_subs

Home-channel notification subscriptions.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| task_id | TEXT | → tasks.id |
| platform | TEXT | messaging platform |
| chat_id | TEXT | Platform chat ID |
| thread_id | TEXT | Thread ID |

## Indexes

```sql
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee);
CREATE INDEX idx_tasks_tenant ON tasks(tenant);
CREATE INDEX idx_links_parent ON task_links(parent_id);
CREATE INDEX idx_links_child ON task_links(child_id);
CREATE INDEX idx_comments_task ON task_comments(task_id);
CREATE INDEX idx_events_task ON task_events(task_id);
CREATE INDEX idx_runs_task ON task_runs(task_id);
```

## Event Kinds

| Kind | Triggered When |
|------|----------------|
| created | Task created |
| status | Status changed |
| assigned | Assignee changed |
| reprioritized | Priority changed |
| edited | Title/body edited |
| blocked | Task blocked |
| unblocked | Task unblocked |
| completed | Task completed |
| reclaimed | Claim released |
| heartbeat | Worker heartbeat |
| comment | Comment added |
| worker_started | Worker spawned |
| worker_ended | Worker finished |

## Run Outcomes

| Outcome | Meaning |
|---------|---------|
| success | Completed normally |
| failed | Worker failed |
| timeout | Exceeded max_runtime |
| cancelled | Cancelled by user |
| reclaimed | Claim forcefully released |

## Status Transitions

Valid task status transitions:

```
triage → todo, archived
todo → ready, triage, archived
ready → running, todo, blocked
running → done, blocked, ready, archived
blocked → ready, archived
done → archived (or reopen to ready)
archived → (terminal)
```

## Notes

- Database uses WAL mode for concurrent access
- Write transactions use BEGIN IMMEDIATE
- Claims use compare-and-swap (CAS) on status and claim_lock
- Hallucination gate verifies created_cards references before completion
