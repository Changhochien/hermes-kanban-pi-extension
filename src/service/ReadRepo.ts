/**
 * Read operations repository — all reads go through SQLite
 */

import { query, queryOne } from "../db/connection.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getHermesHome } from "../utils/board-resolve.js";
import type {
  Task,
  TaskSummary,
  TaskLinks,
  TaskComment,
  TaskEvent,
  TaskRun,
  BoardStats,
  TaskStatus,
  TaskDiagnostics,
  Diagnostic,
  CreateTaskParams,
} from "../types/index.js";

/**
 * Valid task statuses
 */
const VALID_STATUSES: TaskStatus[] = [
  "triage", "todo", "ready", "running", "blocked", "done", "archived"
];

export class ReadRepo {
  constructor(public board: string) {}

  /**
   * List tasks with optional filters
   */
  listTasks(options: {
    status?: TaskStatus;
    assignee?: string;
    tenant?: string;
    includeArchived?: boolean;
    limit?: number;
  } = {}): TaskSummary[] {
    const { status, assignee, tenant, includeArchived = false, limit = 50 } = options;

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!includeArchived) {
      conditions.push("status != 'archived'");
    }
    if (status && VALID_STATUSES.includes(status)) {
      conditions.push("status = ?");
      params.push(status);
    }
    if (assignee) {
      conditions.push("assignee = ?");
      params.push(assignee);
    }
    if (tenant) {
      conditions.push("tenant = ?");
      params.push(tenant);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const sql = `
      SELECT 
        t.id, t.title, t.status, t.assignee, t.priority, t.tenant, t.created_at,
        (SELECT COUNT(*) FROM task_links WHERE child_id = t.id) as parent_count,
        (SELECT COUNT(*) FROM task_links WHERE parent_id = t.id) as child_count,
        (SELECT COUNT(*) FROM task_comments WHERE task_id = t.id) as comment_count
      FROM tasks t
      ${whereClause}
      ORDER BY t.priority DESC, t.created_at ASC
      LIMIT ?
    `;

    params.push(limit);

    const rows = query<TaskSummary>(this.board, sql, params);
    
    return rows.map((row) => ({
      ...row,
      parent_count: Number(row.parent_count),
      child_count: Number(row.child_count),
      comment_count: Number(row.comment_count || 0),
    }));
  }

  /**
   * Get a single task by ID
   */
  getTask(taskId: string): Task | null {
    const row = queryOne<Task>(this.board,
      "SELECT * FROM tasks WHERE id = ?",
      [taskId]
    );
    return row || null;
  }

  /**
   * Get task links (parents and children)
   */
  getTaskLinks(taskId: string): TaskLinks {
    const parents = query<{ parent_id: string }>(
      this.board,
      "SELECT parent_id FROM task_links WHERE child_id = ?",
      [taskId]
    );
    const children = query<{ child_id: string }>(
      this.board,
      "SELECT child_id FROM task_links WHERE parent_id = ?",
      [taskId]
    );
    return {
      parents: parents.map((r) => r.parent_id),
      children: children.map((r) => r.child_id),
    };
  }

  /**
   * Get task comments
   */
  getComments(taskId: string): TaskComment[] {
    return query<TaskComment>(
      this.board,
      "SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC",
      [taskId]
    );
  }

  /**
   * Get task events
   */
  getEvents(taskId: string, limit = 50): TaskEvent[] {
    return query<TaskEvent>(
      this.board,
      "SELECT * FROM task_events WHERE task_id = ? ORDER BY id DESC LIMIT ?",
      [taskId, limit]
    );
  }

  /**
   * Get task runs
   */
  getRuns(taskId: string): TaskRun[] {
    return query<TaskRun>(
      this.board,
      "SELECT * FROM task_runs WHERE task_id = ? ORDER BY id DESC",
      [taskId]
    );
  }

  /**
   * Get board statistics
   */
  getStats(): BoardStats {
    // Count by status
    const statusRows = query<{ status: TaskStatus; count: number }>(
      this.board,
      "SELECT status, COUNT(*) as count FROM tasks GROUP BY status"
    );

    const byStatus: Record<TaskStatus, number> = {
      triage: 0, todo: 0, ready: 0, running: 0, blocked: 0, done: 0, archived: 0
    };
    for (const row of statusRows) {
      if (row.status in byStatus) {
        byStatus[row.status] = row.count;
      }
    }

    // Count by assignee
    const assigneeRows = query<{ assignee: string; count: number }>(
      this.board,
      "SELECT assignee, COUNT(*) as count FROM tasks WHERE assignee IS NOT NULL GROUP BY assignee"
    );
    const byAssignee: Record<string, number> = {};
    for (const row of assigneeRows) {
      byAssignee[row.assignee] = row.count;
    }

    // Find oldest ready task
    const now = Math.floor(Date.now() / 1000);
    const oldestReady = queryOne<{ created_at: number }>(
      this.board,
      "SELECT created_at FROM tasks WHERE status = 'ready' ORDER BY created_at ASC LIMIT 1"
    );
    const oldestReadyAge = oldestReady
      ? now - oldestReady.created_at
      : null;

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    return {
      total,
      by_status: byStatus,
      by_assignee: byAssignee,
      oldest_ready_age_seconds: oldestReadyAge,
    };
  }

  /**
   * Get diagnostics for distressed tasks
   */
  getDiagnostics(): TaskDiagnostics[] {
    const diagnostics: TaskDiagnostics[] = [];
    const now = Math.floor(Date.now() / 1000);
    const STALE_THRESHOLD = 2 * 60 * 60; // 2 hours

    // Find stale running tasks
    const staleRunning = query<{
      id: string;
      title: string;
      status: TaskStatus;
      last_heartbeat_at: number | null;
      last_status_change: number | null;
    }>(this.board, `
      SELECT 
        t.id, t.title, t.status,
        r.last_heartbeat_at,
        (SELECT MAX(created_at) FROM task_events WHERE task_id = t.id AND kind = 'status') as last_status_change
      FROM tasks t
      LEFT JOIN task_runs r ON r.id = t.current_run_id
      WHERE t.status = 'running'
    `);

    for (const task of staleRunning) {
      const lastActivity = task.last_heartbeat_at || task.last_status_change || 0;
      const age = now - lastActivity;

      if (age > STALE_THRESHOLD) {
        diagnostics.push({
          task_id: task.id,
          task_title: task.title,
          task_status: task.status,
          diagnostics: [{
            kind: "stale_running",
            severity: "warning",
            message: `Task running for ${Math.floor(age / 60)} minutes without activity`,
            last_seen_at: lastActivity,
          }],
        });
      }
    }

    // Find tasks with repeated failures
    const failureCounts = query<{ task_id: string; failure_count: number }>(
      this.board,
      `SELECT task_id, COUNT(*) as failure_count
       FROM task_runs
       WHERE outcome IN ('failed', 'timeout')
       GROUP BY task_id
       HAVING failure_count >= 3`
    );

    for (const row of failureCounts) {
      const task = this.getTask(row.task_id);
      if (task && task.status !== "done" && task.status !== "archived") {
        diagnostics.push({
          task_id: row.task_id,
          task_title: task.title,
          task_status: task.status,
          diagnostics: [{
            kind: "repeated_failures",
            severity: row.failure_count >= 5 ? "error" : "warning",
            message: `Task has failed ${row.failure_count} times`,
            last_seen_at: null,
            count: row.failure_count,
          }],
        });
      }
    }

    return diagnostics;
  }

  // --- Preflight validations for write operations ---

  /**
   * Check if a task exists
   */
  taskExists(taskId: string): boolean {
    const row = queryOne<{ count: number }>(
      this.board,
      "SELECT COUNT(*) as count FROM tasks WHERE id = ?",
      [taskId]
    );
    return (row?.count ?? 0) > 0;
  }

  /**
   * Check if an assignee profile exists
   */
  assigneeExists(profile: string): boolean {
    // Check if there's at least one task with this assignee
    // or if it's listed in profiles directory
    const row = queryOne<{ count: number }>(
      this.board,
      "SELECT COUNT(*) as count FROM tasks WHERE assignee = ?",
      [profile]
    );
    
    if ((row?.count ?? 0) > 0) return true;
    
    // Also check if profile directory exists
    const profilePath = join(
      getHermesHome(),
      "profiles",
      profile
    );
    return existsSync(profilePath);
  }

  /**
   * Check if linking would create a cycle
   */
  wouldCreateCycle(parentId: string, childId: string): boolean {
    // Simple cycle detection: BFS from child to see if we can reach parent
    const visited = new Set<string>();
    const queue = [childId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === parentId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      const children = query<{ child_id: string }>(
        this.board,
        "SELECT child_id FROM task_links WHERE parent_id = ?",
        [current]
      );
      for (const row of children) {
        queue.push(row.child_id);
      }
    }

    return false;
  }

  /**
   * Get task by idempotency key
   */
  getByIdempotencyKey(key: string): Task | null {
    // Note: This requires kanban.db to have idempotency_key column
    // If not present, return null
    try {
      return queryOne<Task>(
        this.board,
        "SELECT * FROM tasks WHERE idempotency_key = ? AND status != 'archived'",
        [key]
      ) || null;
    } catch {
      // Column might not exist in older versions
      return null;
    }
  }
}
