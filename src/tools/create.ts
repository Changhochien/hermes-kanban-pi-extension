/**
 * kanban_create tool — Create a new Hermes Kanban task
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

const WORKSPACE_KINDS = ["scratch", "dir", "worktree"] as const;

export function registerKanbanCreateTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_create",
    label: "Kanban Create",
    description: `Create a new task for a Hermes worker to pick up.
The task is created in the specified status (default: todo) and can include
parent tasks for dependency tracking.

Use this to:
- Delegate work to Hermes workers
- Create subtasks linked to parent tasks
- Set task priority and required skills
- Create idempotent tasks (avoiding duplicates)`,
    promptSnippet: "Create kanban task",
    promptGuidelines: [
      "Use kanban_create to delegate work to Hermes workers",
      "Use kanban_create when asked to create, add, or make a task",
      "Use kanban_link to connect related tasks",
    ],
    parameters: {
      type: "object",
      properties: {
        board: { type: "string", description: "Board name (defaults to current board)" },
        title: { type: "string", description: "Task title/summary" },
        assignee: { type: "string", description: "Worker profile to assign" },
        body: { type: "string", description: "Detailed task description (markdown supported)" },
        priority: { type: "integer", description: "Priority (1=highest, 3=normal, 5=lowest)" },
        parents: { type: "array", items: { type: "string" }, description: "Parent task IDs for dependencies" },
        workspace_kind: { type: "string", enum: [...WORKSPACE_KINDS], description: "Workspace type" },
        triage: { type: "boolean", description: "Start in triage status for specification" },
        skills: { type: "array", items: { type: "string" }, description: "Skills to load in the worker" },
        idempotency_key: { type: "string", description: "Unique key to avoid duplicate tasks" },
      },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);

        if (!(await service.isWriteAvailable())) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: hermes CLI not found. Write operations require the hermes CLI in PATH.",
              },
            ],
            details: { tool: "kanban_create", error: "hermes CLI not found" },
          };
        }

        const result = await service.createTask({
          title: params.title,
          assignee: params.assignee,
          body: params.body,
          priority: params.priority,
          workspaceKind: params.workspace_kind,
          parentIds: params.parents,
          triage: params.triage,
          skills: params.skills,
          idempotencyKey: params.idempotency_key,
        });

        if (!result.ok) {
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error}` }],
            details: { tool: "kanban_create", error: result.error, code: result.code },
          };
        }

        const reused = result.data?.reused ? " (reused existing task)" : "";
        const output = `Task created successfully.\nID: ${result.data?.taskId}${reused}`;

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            tool: "kanban_create",
            success: true,
            task_id: result.data?.taskId,
            reused: result.data?.reused,
            board: service.board,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_create", error: message },
        };
      }
    },
  });
}
