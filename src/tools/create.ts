/**
 * kanban_create tool — Create a new Hermes Kanban task
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { getService } from "../service/KanbanServiceFactory.js";

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
      board: {
        type: "string" as const,
        description: "Board name (defaults to current board)",
      }.optional(),
      title: { type: "string" as const, description: "Task title/summary" },
      assignee: { type: "string" as const, description: "Worker profile to assign" },
      body: {
        type: "string" as const,
        description: "Detailed task description (markdown supported)",
      }.optional(),
      priority: {
        type: "integer" as const,
        description: "Priority (1=highest, 3=normal, 5=lowest)",
        minimum: 1,
        maximum: 5,
      }.optional(),
      parents: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Parent task IDs for dependencies",
      }.optional(),
      workspace_kind: StringEnum(["scratch", "dir", "worktree"] as const)
        .optional(),
      triage: {
        type: "boolean" as const,
        description: "Start in triage status for specification",
      }.optional(),
      skills: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Skills to load in the worker",
      }.optional(),
      idempotency_key: {
        type: "string" as const,
        description: "Unique key to avoid duplicate tasks",
      }.optional(),
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
