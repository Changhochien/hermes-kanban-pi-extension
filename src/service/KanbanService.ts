/**
 * KanbanService — Facade that orchestrates reads and writes
 * 
 * This is the single entry point for all kanban operations.
 * Tools don't directly use ReadRepo or WriteRepo.
 */

import { ReadRepo } from "./ReadRepo.js";
import { WriteRepo } from "./WriteRepo.js";
import { existsSync } from "node:fs";
import { readdirSync } from "node:fs";
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
  BoardColumn,
  TaskDiagnostics,
  TaskStatus,
} from "../types/index.js";
import { failure, success, type Result } from "../utils/errors.js";
import { truncateOutput } from "../utils/truncate.js";

/**
 * Options for listTasks
 */
export interface ListOptions {
  status?: TaskStatus;
  assignee?: string;
  tenant?: string;
  includeArchived?: boolean;
  limit?: number;
}

/**
 * Options for getDiagnostics
 */
export interface DiagnosticsOptions {
  severity?: "warning" | "error" | "critical";
}

/**
 * Board result for getBoard
 */
export interface BoardResult {
  columns: BoardColumn[];
  stats: BoardStats;
}

/**
 * Task detail result for getTask
 */
export interface TaskDetail {
  task: Task;
  links: TaskLinks;
  comments: TaskComment[];
  events: TaskEvent[];
  runs: TaskRun[];
}

/**
 * KanbanService — unified interface for kanban operations
 */
export class KanbanService {
  private readRepo: ReadRepo;
  private writeRepo: WriteRepo;

  constructor(board: string = "default") {
    this.readRepo = new ReadRepo(board);
    this.writeRepo = new WriteRepo(this.readRepo);
  }

  /**
   * Get the board name
   */
  get board(): string {
    return this.readRepo.board;
  }

  // --- Read Operations ---

  /**
   * List tasks with optional filters
   */
  listTasks(options: ListOptions = {}): TaskSummary[] {
    return this.readRepo.listTasks(options);
  }

  /**
   * Get the full board grouped by column
   */
  getBoard(): BoardResult {
    const tasks = this.readRepo.listTasks({ includeArchived: false, limit: 200 });
    const stats = this.readRepo.getStats();

    // Group by status
    const byStatus: Record<TaskStatus, TaskSummary[]> = {
      triage: [], todo: [], ready: [], running: [], blocked: [], done: [], archived: [],
    };

    for (const task of tasks) {
      if (task.status in byStatus) {
        byStatus[task.status].push(task);
      }
    }

    // Build columns in order
    const columnOrder: TaskStatus[] = [
      "triage", "todo", "ready", "running", "blocked", "done"
    ];

    const columns: BoardColumn[] = columnOrder
      .filter((s) => byStatus[s].length > 0)
      .map((name) => ({ name, tasks: byStatus[name] }));

    return { columns, stats };
  }

  /**
   * Get detailed task information
   */
  getTask(taskId: string): TaskDetail | null {
    const task = this.readRepo.getTask(taskId);
    if (!task) return null;

    return {
      task,
      links: this.readRepo.getTaskLinks(taskId),
      comments: this.readRepo.getComments(taskId),
      events: this.readRepo.getEvents(taskId),
      runs: this.readRepo.getRuns(taskId),
    };
  }

  /**
   * Get board statistics
   */
  getStats(): BoardStats {
    return this.readRepo.getStats();
  }

  /**
   * Get task diagnostics
   */
  getDiagnostics(options: DiagnosticsOptions = {}): TaskDiagnostics[] {
    const all = this.readRepo.getDiagnostics();

    if (!options.severity) return all;

    return all
      .map((task) => ({
        ...task,
        diagnostics: task.diagnostics.filter(
          (d) => d.severity === options.severity
        ),
      }))
      .filter((task) => task.diagnostics.length > 0);
  }

  // --- Write Operations ---

  /**
   * Create a new task
   */
  async createTask(params: {
    title: string;
    assignee: string;
    body?: string;
    priority?: number;
    workspaceKind?: string;
    parentIds?: string[];
    triage?: boolean;
    skills?: string[];
    idempotencyKey?: string;
  }): Promise<Result<{ taskId: string; reused: boolean }>> {
    return this.writeRepo.createTask(params);
  }

  /**
   * Complete a task
   */
  async completeTask(params: {
    taskId: string;
    summary?: string;
    metadata?: Record<string, unknown>;
    result?: string;
    createdCards?: string[];
  }): Promise<Result> {
    return this.writeRepo.completeTask(params);
  }

  /**
   * Block a task
   */
  async blockTask(params: {
    taskId: string;
    reason: string;
  }): Promise<Result> {
    return this.writeRepo.blockTask(params);
  }

  /**
   * Add a comment
   */
  async addComment(params: {
    taskId: string;
    body: string;
  }): Promise<Result<{ commentId: number }>> {
    return this.writeRepo.addComment(params);
  }

  /**
   * Link tasks
   */
  async linkTasks(params: {
    parentId: string;
    childId: string;
  }): Promise<Result> {
    return this.writeRepo.linkTasks(params);
  }

  /**
   * Unblock a task
   */
  async unblockTask(taskId: string): Promise<Result> {
    return this.writeRepo.unblockTask(taskId);
  }

  /**
   * Assign a task
   */
  async assignTask(taskId: string, assignee: string): Promise<Result> {
    return this.writeRepo.assignTask(taskId, assignee);
  }

  /**
   * Send a heartbeat for a task (prevents stale detection)
   */
  async heartbeat(taskId?: string): Promise<Result<{ taskId: string }>> {
    const tid = taskId || process.env.HERMES_KANBAN_TASK;
    if (!tid) {
      return {
        ok: false,
        error: "No task ID provided and HERMES_KANBAN_TASK not set",
        code: "VALIDATION_ERROR",
      };
    }

    const result = await this.writeRepo.runCommand(["heartbeat", tid]);
    if (!result.ok) {
      return {
        ok: false,
        error: result.stderr || "Failed to send heartbeat",
        code: "CLI_ERROR",
      };
    }

    return { ok: true, data: { taskId: tid } };
  }

  /**
   * Reclaim a stuck task
   */
  async reclaimTask(taskId: string, reason?: string): Promise<Result> {
    // Preflight: check task exists and is in running state
    if (!this.readRepo.taskExists(taskId)) {
      return {
        ok: false,
        error: `Task ${taskId} not found`,
        code: "TASK_NOT_FOUND",
      };
    }

    const task = this.readRepo.getTask(taskId);
    if (task && task.status !== "running") {
      return {
        ok: false,
        error: `Task ${taskId} is not in running state (current: ${task.status})`,
        code: "VALIDATION_ERROR",
      };
    }

    const args = ["reclaim", taskId];
    if (reason) {
      args.push("--reason", reason);
    }

    const result = await this.writeRepo.runCommand(args);
    if (!result.ok) {
      return {
        ok: false,
        error: result.stderr || "Failed to reclaim task",
        code: "CLI_ERROR",
      };
    }

    return { ok: true };
  }

  /**
   * List available boards
   */
  getBoards(): Array<{ slug: string; path: string; taskCount: number }> {
    const hermesHome = getHermesHome();
    const boards: Array<{ slug: string; path: string; taskCount: number }> = [];

    // Always include default board
    const defaultPath = join(hermesHome, "kanban.db");
    if (existsSync(defaultPath)) {
      try {
        const count = this.readRepo.listTasks({}).length;
        boards.push({ slug: "default", path: defaultPath, taskCount: count });
      } catch {
        boards.push({ slug: "default", path: defaultPath, taskCount: 0 });
      }
    }

    // Check for multi-board directory
    const boardsDir = join(hermesHome, "kanban", "boards");
    if (existsSync(boardsDir)) {
      try {
        const entries = readdirSync(boardsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const boardPath = join(boardsDir, entry.name, "kanban.db");
            if (existsSync(boardPath)) {
              try {
                // Create a temp ReadRepo to count tasks
                const tempRepo = new ReadRepo(entry.name);
                const count = tempRepo.listTasks({}).length;
                boards.push({ slug: entry.name, path: boardPath, taskCount: count });
              } catch {
                boards.push({ slug: entry.name, path: boardPath, taskCount: 0 });
              }
            }
          }
        }
      } catch {
        // Ignore errors reading boards directory
      }
    }

    return boards;
  }

  /**
   * Get worker context from HERMES_KANBAN_TASK env var
   */
  getWorkerContext(): TaskDetail | null {
    const taskId = process.env.HERMES_KANBAN_TASK;
    if (!taskId) {
      return null;
    }
    return this.getTask(taskId);
  }

  /**
   * Format worker context for injection into system prompt
   */
  formatWorkerContext(): string {
    const context = this.getWorkerContext();
    if (!context) {
      return "[No HERMES_KANBAN_TASK set — not running as Hermes worker]";
    }

    const { task, links, comments, runs } = context;
    let output = "[HERMES WORKER CONTEXT]\n";
    output += `Task: ${task.id} — \"${task.title}\"\n`;
    output += `Status: ${task.status}\n`;
    output += `Description: ${task.body || "(none)"}\n`;

    if (links.parents.length > 0) {
      output += `Parents: ${links.parents.join(", ")}\n`;
    }

    if (comments.length > 0) {
      output += `Comments:\n`;
      for (const c of comments.slice(-3)) {
        output += `  @${c.author}: ${c.body.slice(0, 200)}\n`;
      }
    }

    output += `Run history: ${runs.length} attempt(s)\n`;
    output += `\nWhen finished: call kanban_complete(summary=\"...\")\n`;
    output += `If blocked: call kanban_block(reason=\"...\")`;

    return output;
  }

  /**
   * Close the service (close database connections)
   */
  close(): void {
    this.readRepo.close();
  }

  // --- Utilities ---

  /**
   * Check if hermes CLI is available for writes (async)
   */
  async isWriteAvailable(): Promise<boolean> {
    return this.writeRepo.checkHermesAvailable();
  }

  /**
   * Format a task summary for display
   */
  formatTaskList(tasks: TaskSummary[], options?: { truncate?: boolean }): string {
    if (tasks.length === 0) {
      return "No tasks found.";
    }

    let output = `**${tasks.length} task(s)**\n\n`;

    for (const task of tasks) {
      const status = task.status.toUpperCase().padEnd(8);
      const assignee = task.assignee ? `@${task.assignee}` : "(unassigned)";
      output += `[${task.id}] ${task.title}\n`;
      output += `   Status: ${status} | ${assignee} | Priority: ${task.priority}\n`;

      if (task.parent_count > 0) {
        output += `   Parents: ${task.parent_count} | Children: ${task.child_count}\n`;
      }
    }

    return options?.truncate ? truncateOutput(output) : output;
  }

  /**
   * Format a task detail for display
   */
  formatTaskDetail(detail: TaskDetail): string {
    const { task, links, comments, events, runs } = detail;

    const formatTime = (ts: number | null) =>
      ts ? new Date(ts * 1000).toISOString() : "—";

    let output = `# ${task.title}\n\n`;
    output += `**ID:** ${task.id}\n`;
    output += `**Status:** ${task.status}\n`;
    output += `**Assignee:** ${task.assignee || "(unassigned)"}\n`;
    output += `**Priority:** ${task.priority}\n`;
    output += `**Created:** ${formatTime(task.created_at)}\n`;

    if (task.started_at) output += `**Started:** ${formatTime(task.started_at)}\n`;
    if (task.completed_at) output += `**Completed:** ${formatTime(task.completed_at)}\n`;

    output += `\n## Description\n\n${task.body || "(no description)"}\n`;

    if (links.parents.length > 0) {
      output += `\n## Parents\n${links.parents.map((id) => `- ${id}`).join("\n")}\n`;
    }

    if (links.children.length > 0) {
      output += `\n## Children\n${links.children.map((id) => `- ${id}`).join("\n")}\n`;
    }

    if (comments.length > 0) {
      output += `\n## Comments (${comments.length})\n`;
      for (const c of comments) {
        output += `\n**${c.author}** (${formatTime(c.created_at)}):\n${c.body}\n`;
      }
    }

    if (runs.length > 0) {
      output += `\n## Runs (${runs.length})\n`;
      for (const r of runs.slice(0, 5)) {
        output += `- Run #${r.id}: ${r.profile} — ${r.status}`;
        if (r.outcome) output += ` (${r.outcome})`;
        output += "\n";
      }
    }

    return truncateOutput(output);
  }

  /**
   * Format board for display
   */
  formatBoard(result: BoardResult): string {
    let output = `# Kanban Board\n\n`;
    output += `**Total:** ${result.stats.total} tasks\n\n`;

    for (const column of result.columns) {
      if (column.tasks.length > 0) {
        output += `## ${column.name.toUpperCase()} (${column.tasks.length})\n`;
        for (const task of column.tasks.slice(0, 10)) {
          const assignee = task.assignee ? ` @${task.assignee}` : "";
          output += `- [${task.id}] ${task.title}${assignee}\n`;
        }
        if (column.tasks.length > 10) {
          output += `  ... and ${column.tasks.length - 10} more\n`;
        }
        output += "\n";
      }
    }

    output += `## Stats\n`;
    output += `- triage: ${result.stats.by_status.triage}\n`;
    output += `- todo: ${result.stats.by_status.todo}\n`;
    output += `- ready: ${result.stats.by_status.ready}\n`;
    output += `- running: ${result.stats.by_status.running}\n`;
    output += `- blocked: ${result.stats.by_status.blocked}\n`;
    output += `- done: ${result.stats.by_status.done}\n`;

    if (Object.keys(result.stats.by_assignee).length > 0) {
      output += `\n## By Assignee\n`;
      for (const [assignee, count] of Object.entries(result.stats.by_assignee)) {
        output += `- ${assignee}: ${count}\n`;
      }
    }

    return truncateOutput(output);
  }

  /**
   * Format diagnostics for display
   */
  formatDiagnostics(diagnostics: TaskDiagnostics[]): string {
    if (diagnostics.length === 0) {
      return "No diagnostic issues found. All tasks appear healthy.";
    }

    let output = `# Diagnostics (${diagnostics.length} issue(s))\n\n`;

    for (const td of diagnostics) {
      output += `## ${td.task_id}: ${td.task_title || "(untitled)"}\n`;
      output += `Status: ${td.task_status}\n\n`;

      for (const d of td.diagnostics) {
        const emoji = d.severity === "critical" ? "🔴" :
                      d.severity === "error" ? "🟠" : "🟡";
        output += `${emoji} **[${d.severity}]** ${d.message}\n`;
      }
      output += "\n";
    }

    return truncateOutput(output);
  }

  /**
   * Format stats for display
   */
  formatStats(stats: BoardStats): string {
    let output = "# Board Statistics\n\n";
    output += `**Total:** ${stats.total} tasks\n\n`;

    output += "## By Status\n";
    for (const [status, count] of Object.entries(stats.by_status)) {
      if (count > 0) {
        const pct = stats.total > 0 ? ((count / stats.total) * 100).toFixed(1) : "0.0";
        output += `- ${status}: ${count} (${pct}%)\n`;
      }
    }

    if (Object.keys(stats.by_assignee).length > 0) {
      output += "\n## By Assignee\n";
      const sorted = Object.entries(stats.by_assignee).sort((a, b) => b[1] - a[1]);
      for (const [assignee, count] of sorted) {
        output += `- ${assignee}: ${count}\n`;
      }
    }

    if (stats.oldest_ready_age_seconds !== null) {
      const minutes = Math.floor(stats.oldest_ready_age_seconds / 60);
      const hours = Math.floor(minutes / 60);
      output += `\n## Bottlenecks\n`;
      output += `- Oldest ready: ${hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`} ago\n`;
    }

    return output;
  }
}
