/**
 * TypeScript types for Hermes Kanban integration
 * 
 * These types mirror the Hermes kanban_db.py dataclasses
 * for type-safe database operations.
 */

export interface Task {
  id: string;
  title: string;
  body: string | null;
  status: TaskStatus;
  assignee: string | null;
  tenant: string | null;
  priority: number;
  workspace_kind: WorkspaceKind;
  workspace_path: string | null;
  created_by: string;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  result: string | null;
  current_run_id: number | null;
}

export type TaskStatus = 
  | 'triage' 
  | 'todo' 
  | 'ready' 
  | 'running' 
  | 'blocked' 
  | 'done' 
  | 'archived';

export type WorkspaceKind = 'scratch' | 'worktree' | 'dir';

export interface TaskComment {
  id: number;
  task_id: string;
  author: string;
  body: string;
  created_at: number;
}

export interface TaskEvent {
  id: number;
  task_id: string;
  run_id: number | null;
  kind: EventKind;
  payload: string | null;
  created_at: number;
}

export type EventKind = 
  | 'created'
  | 'status'
  | 'assigned'
  | 'reprioritized'
  | 'edited'
  | 'blocked'
  | 'unblocked'
  | 'completed'
  | 'reclaimed'
  | 'heartbeat'
  | 'comment'
  | 'worker_started'
  | 'worker_ended';

export interface TaskRun {
  id: number;
  task_id: string;
  profile: string;
  step_key: string | null;
  status: RunStatus;
  claim_lock: string | null;
  claim_expires: number | null;
  worker_pid: number | null;
  max_runtime_seconds: number | null;
  last_heartbeat_at: number | null;
  started_at: number | null;
  ended_at: number | null;
  outcome: string | null;
  summary: string | null;
  metadata: string | null;
  error: string | null;
}

export type RunStatus = 
  | 'pending' 
  | 'claimed' 
  | 'running' 
  | 'success' 
  | 'failed' 
  | 'timeout' 
  | 'cancelled' 
  | 'reclaimed';

export interface TaskLinks {
  parents: string[];
  children: string[];
}

export interface BoardColumn {
  name: TaskStatus;
  tasks: TaskSummary[];
}

export interface TaskSummary {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: string | null;
  priority: number;
  tenant: string | null;
  created_at: number;
  parent_count: number;
  child_count: number;
  comment_count?: number;
}

export interface CreateTaskParams {
  title: string;
  body?: string;
  assignee: string;
  tenant?: string;
  priority?: number;
  workspace_kind?: WorkspaceKind;
  workspace_path?: string;
  parents?: string[];
  triage?: boolean;
  idempotency_key?: string;
  max_runtime_seconds?: number;
  skills?: string[];
}

export interface CompleteTaskParams {
  task_id: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  result?: string;
  created_cards?: string[];
}

export interface BlockTaskParams {
  task_id: string;
  reason: string;
}

export interface LinkTasksParams {
  parent_id: string;
  child_id: string;
}

export interface KanbanConfig {
  dbPath: string;
  workspacesRoot: string;
  logsPath: string;
  currentBoard: string;
}

// Tool result types
export interface ToolResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface ListResult extends ToolResult {
  tasks: TaskSummary[];
  count: number;
  truncated: boolean;
}

export interface BoardResult extends ToolResult {
  columns: BoardColumn[];
  stats: BoardStats;
}

export interface BoardStats {
  total: number;
  by_status: Record<TaskStatus, number>;
  by_assignee: Record<string, number>;
  oldest_ready_age_seconds: number | null;
}

export interface ShowResult extends ToolResult {
  task: Task;
  parents: string[];
  children: string[];
  comments: TaskComment[];
  events: TaskEvent[];
  runs: TaskRun[];
}

export interface DiagnosticsResult extends ToolResult {
  diagnostics: TaskDiagnostics[];
  count: number;
}

export interface TaskDiagnostics {
  task_id: string;
  task_title: string | null;
  task_status: TaskStatus | null;
  diagnostics: Diagnostic[];
}

export interface Diagnostic {
  kind: string;
  severity: 'warning' | 'error' | 'critical';
  message: string;
  last_seen_at: number | null;
  count?: number;
}
