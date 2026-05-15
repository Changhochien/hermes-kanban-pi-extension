/**
 * kanban_show tool — Get detailed task information
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KanbanService } from "../service/KanbanService.js";

export function registerKanbanShowTool(
  pi: ExtensionAPI,
  getService: () => KanbanService
): void {
  pi.registerTool({
    name: "kanban_show",
    label: "Kanban Show",
    description: `Get full details of a task including body, comments, events, 
and run history. Use this to understand task context before starting work,
review what has been done, or investigate issues.

Returns:
- Task fields (title, body, status, assignee, etc.)
- Parent and child task links
- Comment thread with all notes
- Event log of all state changes
- Run history of all attempts`,
    promptSnippet: "Show task details",
    promptGuidelines: [
      "Use kanban_show when asked to show, view, or get details of a specific task",
      "Use kanban_show to investigate a task before working on it",
      "Use kanban_list to find tasks first",
    ],
    parameters: {
      task_id: { type: "string" as const, description: "Task ID (format: t_<hex8>, e.g., t_12345678)" },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService();
        const detail = service.getTask(params.task_id);

        if (!detail) {
          return {
            content: [{ type: "text" as const, text: `Task not found: ${params.task_id}` }],
            details: { tool: "kanban_show", error: "Task not found" },
          };
        }

        const output = service.formatTaskDetail(detail);

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            tool: "kanban_show",
            task_id: detail.task.id,
            has_body: !!detail.task.body,
            comment_count: detail.comments.length,
            run_count: detail.runs.length,
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
