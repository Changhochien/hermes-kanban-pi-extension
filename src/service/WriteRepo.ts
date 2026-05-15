/**
 * Write operations repository — all writes go through CLI
 * 
 * Each operation follows:
 * 1. Preflight validation (read from SQLite)
 * 2. CLI execution
 * 3. Result verification
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { homedir } from "node:os";
import { ReadRepo } from "./ReadRepo.js";
import { getHermesHome } from "../utils/board-resolve.js";
import { KanbanError, KanbanErrorCode, type Result } from "../utils/errors.js";
import { parseTaskId, parseCliError } from "../cli/parser.js";

const execFileAsync = promisify(execFile);

/**
 * CLI execution result
 */
interface CliResult {
  ok: boolean;
  output: string;
  stderr: string;
  exitCode: number;
}

/**
 * Write repository for CLI operations
 */
export class WriteRepo {
  private hermesPath: string | null = null;
  private hermesResolvePromise: Promise<string | null> | null = null;

  constructor(private readRepo: ReadRepo) {
    // Don't resolve here — lazy initialization on first use
  }

  /**
   * Lazily resolve hermes path, caching the promise
   */
  private async resolveHermesPath(): Promise<string | null> {
    // Return cached promise if already resolving
    if (this.hermesResolvePromise) {
      return this.hermesResolvePromise;
    }

    this.hermesResolvePromise = this._doResolveHermesPath();
    return this.hermesResolvePromise;
  }

  /**
   * Actually find and validate hermes executable
   */
  private async _doResolveHermesPath(): Promise<string | null> {
    const possiblePaths = [
      "hermes",
      join(homedir(), ".local", "bin", "hermes"),
      "/usr/local/bin/hermes",
      "/usr/bin/hermes",
    ];

    for (const p of possiblePaths) {
      try {
        // Use command -v for POSIX-compliant path lookup
        const { stdout } = await execFileAsync("sh", [
          "-c",
          `command -v ${p.replace(/.*\//, "")} 2>/dev/null || echo "${p}"`
        ]);
        const resolved = stdout.trim();
        
        // Verify it exists and is executable
        try {
          await execFileAsync("test", ["-x", resolved]);
          this.hermesPath = resolved;
          return resolved;
        } catch {
          continue;
        }
      } catch {
        continue;
      }
    }

    console.warn("[hermes-kanban] hermes CLI not found in PATH");
    return null;
  }

  /**
   * Ensure hermes is resolved before use
   */
  private async ensureHermesPath(): Promise<string> {
    if (this.hermesPath) {
      return this.hermesPath;
    }

    const path = await this.resolveHermesPath();
    if (!path) {
      throw new KanbanError(
        "hermes CLI not found. Install Hermes or add it to PATH.",
        KanbanErrorCode.CLI_NOT_FOUND
      );
    }

    return path;
  }

  /**
   * Check if hermes CLI is available (async check on first call)
   */
  async checkHermesAvailable(): Promise<boolean> {
    const path = await this.resolveHermesPath();
    return path !== null;
  }

  /**
   * Run a hermes kanban command via CLI
   * Uses execFile (not exec) to avoid shell injection
   */
  async runCommand(args: string[]): Promise<CliResult> {
    const hermesPath = await this.ensureHermesPath();
    const fullArgs = ["kanban", ...args];

    try {
      const { stdout, stderr } = await execFileAsync(hermesPath, fullArgs, {
        timeout: 30000,
        env: {
          ...process.env,
          HERMES_HOME: getHermesHome(),
          HERMES_KANBAN_BOARD: this.readRepo.board,
        },
      });

      return {
        ok: true,
        output: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };
    } catch (err: unknown) {
      const execErr = err as { code?: number; message?: string; stderr?: string };
      return {
        ok: false,
        output: "",
        stderr: execErr.stderr || execErr.message || "Unknown error",
        exitCode: execErr.code || 1,
      };
    }
  }

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
    // Preflight: validate assignee
    if (!this.readRepo.assigneeExists(params.assignee)) {
      return {
        ok: false,
        error: `Assignee '${params.assignee}' not found`,
        code: KanbanErrorCode.ASSIGNEE_NOT_FOUND,
      };
    }

    // Preflight: check idempotency key
    if (params.idempotencyKey) {
      const existing = this.readRepo.getByIdempotencyKey(params.idempotencyKey);
      if (existing) {
        return {
          ok: true,
          data: { taskId: existing.id, reused: true },
        };
      }
    }

    // Build CLI args
    const args = ["create", "--title", params.title, "--assignee", params.assignee];

    if (params.body) {
      args.push("--body", params.body);
    }
    if (params.priority !== undefined) {
      args.push("--priority", String(params.priority));
    }
    if (params.workspaceKind && params.workspaceKind !== "scratch") {
      args.push("--workspace-kind", params.workspaceKind);
    }
    if (params.triage) {
      args.push("--triage");
    }
    if (params.parentIds) {
      for (const parentId of params.parentIds) {
        args.push("--parent", parentId);
      }
    }
    if (params.skills) {
      for (const skill of params.skills) {
        args.push("--skill", skill);
      }
    }
    if (params.idempotencyKey) {
      args.push("--idempotency-key", params.idempotencyKey);
    }

    // Execute
    const result = await this.runCommand(args);

    if (!result.ok) {
      return {
        ok: false,
        error: result.stderr || "Failed to create task",
        code: KanbanErrorCode.CLI_ERROR,
      };
    }

    // Verify task was created
    const taskId = parseTaskId(result.output);
    if (taskId && !this.readRepo.taskExists(taskId)) {
      return {
        ok: false,
        error: "Task created but not found in database",
        code: KanbanErrorCode.DB_ERROR,
      };
    }

    return {
      ok: true,
      data: { taskId: taskId || "unknown", reused: false },
    };
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
    // Preflight: check task exists
    if (!this.readRepo.taskExists(params.taskId)) {
      return {
        ok: false,
        error: `Task ${params.taskId} not found`,
        code: KanbanErrorCode.TASK_NOT_FOUND,
      };
    }

    const task = this.readRepo.getTask(params.taskId);
    if (task?.status === "done") {
      return {
        ok: false,
        error: `Task ${params.taskId} is already completed`,
        code: KanbanErrorCode.ALREADY_COMPLETED,
      };
    }

    const args = ["complete", params.taskId];

    if (params.summary) {
      args.push("--summary", params.summary);
    }
    if (params.metadata) {
      args.push("--metadata", JSON.stringify(params.metadata));
    }
    if (params.result) {
      args.push("--result", params.result);
    }
    if (params.createdCards) {
      for (const cardId of params.createdCards) {
        args.push("--created-cards", cardId);
      }
    }

    const result = await this.runCommand(args);

    if (!result.ok) {
      // Check for hallucinated cards error
      if (result.stderr.includes("does not exist") || result.stderr.includes("phantom")) {
        return {
          ok: false,
          error: result.stderr,
          code: KanbanErrorCode.HALLUCINATED_CARDS,
        };
      }
      return {
        ok: false,
        error: result.stderr || "Failed to complete task",
        code: KanbanErrorCode.CLI_ERROR,
      };
    }

    return { ok: true };
  }

  /**
   * Block a task
   */
  async blockTask(params: {
    taskId: string;
    reason: string;
  }): Promise<Result> {
    // Preflight: check task exists
    if (!this.readRepo.taskExists(params.taskId)) {
      return {
        ok: false,
        error: `Task ${params.taskId} not found`,
        code: KanbanErrorCode.TASK_NOT_FOUND,
      };
    }

    const task = this.readRepo.getTask(params.taskId);
    if (task?.status === "blocked") {
      return { ok: true }; // Idempotent
    }

    const result = await this.runCommand([
      "block", params.taskId,
      "--reason", params.reason,
    ]);

    if (!result.ok) {
      return {
        ok: false,
        error: result.stderr || "Failed to block task",
        code: KanbanErrorCode.CLI_ERROR,
      };
    }

    return { ok: true };
  }

  /**
   * Add a comment to a task
   */
  async addComment(params: {
    taskId: string;
    body: string;
  }): Promise<Result<{ commentId: number }>> {
    // Preflight: check task exists
    if (!this.readRepo.taskExists(params.taskId)) {
      return {
        ok: false,
        error: `Task ${params.taskId} not found`,
        code: KanbanErrorCode.TASK_NOT_FOUND,
      };
    }

    const result = await this.runCommand([
      "comment", params.taskId,
      "--body", params.body,
    ]);

    if (!result.ok) {
      return {
        ok: false,
        error: result.stderr || "Failed to add comment",
        code: KanbanErrorCode.CLI_ERROR,
      };
    }

    // Parse comment ID from output if present
    const commentMatch = result.output.match(/comment[_\s]*id[:\s]*(\d+)/i);
    const commentId = commentMatch ? parseInt(commentMatch[1], 10) : 0;

    return {
      ok: true,
      data: { commentId },
    };
  }

  /**
   * Link two tasks (parent → child)
   */
  async linkTasks(params: {
    parentId: string;
    childId: string;
  }): Promise<Result> {
    // Preflight: check both tasks exist
    if (!this.readRepo.taskExists(params.parentId)) {
      return {
        ok: false,
        error: `Parent task ${params.parentId} not found`,
        code: KanbanErrorCode.TASK_NOT_FOUND,
      };
    }
    if (!this.readRepo.taskExists(params.childId)) {
      return {
        ok: false,
        error: `Child task ${params.childId} not found`,
        code: KanbanErrorCode.TASK_NOT_FOUND,
      };
    }

    // Preflight: check for cycles
    if (this.readRepo.wouldCreateCycle(params.parentId, params.childId)) {
      return {
        ok: false,
        error: "Link would create a dependency cycle",
        code: KanbanErrorCode.CYCLE_DETECTED,
      };
    }

    const result = await this.runCommand([
      "link",
      "--parent", params.parentId,
      "--child", params.childId,
    ]);

    if (!result.ok) {
      // Cycle detection might be in CLI too
      if (result.stderr.includes("cycle")) {
        return {
          ok: false,
          error: "Link would create a dependency cycle",
          code: KanbanErrorCode.CYCLE_DETECTED,
        };
      }
      return {
        ok: false,
        error: result.stderr || "Failed to link tasks",
        code: KanbanErrorCode.CLI_ERROR,
      };
    }

    return { ok: true };
  }

  /**
   * Unblock a task
   */
  async unblockTask(taskId: string): Promise<Result> {
    if (!this.readRepo.taskExists(taskId)) {
      return {
        ok: false,
        error: `Task ${taskId} not found`,
        code: KanbanErrorCode.TASK_NOT_FOUND,
      };
    }

    const result = await this.runCommand(["unblock", taskId]);

    if (!result.ok) {
      return {
        ok: false,
        error: result.stderr || "Failed to unblock task",
        code: KanbanErrorCode.CLI_ERROR,
      };
    }

    return { ok: true };
  }

  /**
   * Assign a task to a profile
   */
  async assignTask(taskId: string, assignee: string): Promise<Result> {
    if (!this.readRepo.taskExists(taskId)) {
      return {
        ok: false,
        error: `Task ${taskId} not found`,
        code: KanbanErrorCode.TASK_NOT_FOUND,
      };
    }

    const result = await this.runCommand(["assign", taskId, assignee]);

    if (!result.ok) {
      return {
        ok: false,
        error: result.stderr || "Failed to assign task",
        code: KanbanErrorCode.CLI_ERROR,
      };
    }

    return { ok: true };
  }
}
