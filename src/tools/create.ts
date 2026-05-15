/**
 * kanban_create tool — Create a new task on the Kanban board
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import type { KanbanService } from "../service/KanbanService.js";

export function registerKanbanCreateTool(
  pi: ExtensionAPI,
  getService: () => KanbanService
): void {
  pi.registerTool({
    name: "kanban_create",
    label: "Kanban Create",
    description: `Create a new task on the Hermes Kanban board.
The task will be picked up by the assigned worker profile on the 
dispatcher's next tick. Use for fanning out work to specialized 
Hermes agents.

Required: title and assignee
Optional: body (full description), priority, parents (dependencies),
workspace kind, and skills to load in the worker`,
    promptSnippet: "Create kanban task",
    promptGuidelines: [
      "Use kanban_create when asked to create, add, or make a new task",
      "Use kanban_create when delegating work to Hermes agents",
      "kanban_create requires a title and assignee",
    ],
    parameters: {
      title: { type: "string" as const, description: "Task title (short, descriptive)" },
      assignee: { type: "string" as const, description: "Worker profile name (e.g., 'researcher', 'coder', 'reviewer')" },
      body: { type: "string" as const, description: "Full task description with requirements and context" }.optional(),
      priority: { type: "integer" as const, description: "Priority (higher = picked sooner, default 0)", minimum: -100, maximum: 100 }.optional(),
      parents: { type: "array" as const, items: { type: "string" as const }, description: "Parent task IDs for dependencies" }.optional(),
      workspace_kind: StringEnum(["scratch", "dir", "worktree"] as const).optional(),
      workspace_path: { type: "string" as const, description: "Path for dir/worktree workspace" }.optional(),
      triage: { type: "boolean" as const, description: "Start in triage status for specification" }.optional(),
      skills: { type: "array" as const, items: { type: "string" as const }, description: "Skills to load in the worker" }.optional(),
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService();

        if (!(await service.isWriteAvailable())) {
          return {
            content: [{ type: "text" as const, text: "Error: hermes CLI not found. Write operations require the hermes CLI in PATH." }],
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
          details: { tool: "kanban_create", success: true, task_id: result.data?.taskId, reused: result.data?.reused },
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
