/**
 * kanban_show tool — Get detailed task information
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export function registerKanbanShowTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_show",
    label: "Kanban Show",
    description: `Get full details of a task including body, comments, events, and run history.
Returns comprehensive task information useful for understanding context before 
starting work or investigating issues.

Use this to:
- Get full task description before starting work
- Read comments and discussions about a task
- Check run history and previous attempts
- Understand task dependencies (parents/children)`,
    promptSnippet: "Show kanban task details",
    promptGuidelines: [
      "Use kanban_show when asked to show, view, or get details of a specific task",
      "Use kanban_show to understand context before starting a task",
      "Use kanban_list to find tasks first",
    ],
    parameters: {
      board: {
        type: "string" as const,
        description: "Board name (defaults to current board)",
      }.optional(),
      task_id: { type: "string" as const, description: "Task ID (t_<hex8>)" },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);
        const detail = service.getTask(params.task_id);

        if (!detail) {
          return {
            content: [{ type: "text" as const, text: `Task ${params.task_id} not found.` }],
            details: { tool: "kanban_show", error: "Task not found", task_id: params.task_id },
          };
        }

        const output = service.formatTaskDetail(detail);

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            tool: "kanban_show",
            task_id: params.task_id,
            board: service.board,
            status: detail.task.status,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_show", error: message },
        };
      }
    },
  });
}
