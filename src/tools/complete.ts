/**
 * kanban_complete tool — Mark a task as done
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export function registerKanbanCompleteTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_complete",
    label: "Kanban Complete",
    description: `Mark a task as done with a summary of the work completed.
The summary is added as a comment and can include metadata about outcomes.
If called without task_id, uses HERMES_KANBAN_TASK (when running as Hermes worker).

Use this to:
- Mark work as finished
- Provide handoff summary for next tasks
- Record outcomes and learnings
- Trigger downstream tasks (children)`,
    promptSnippet: "Complete kanban task",
    promptGuidelines: [
      "Use kanban_complete when work is finished",
      "Use kanban_complete when asked to close, finish, or mark done",
      "Include a summary of what was accomplished",
    ],
    parameters: {
      board: { type: "string", description: "Board name (defaults to current board)" },
      task_id: { type: "string", description: "Task ID (t_<hex8>). Uses HERMES_KANBAN_TASK if not provided." },
      summary: { type: "string", description: "Summary of work completed" },
      result: { type: "string", description: "Final result/output of the task" },
      created_cards: { type: "array", items: { type: "string" }, description: "Task IDs created as part of this task" },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);

        // Use HERMES_KANBAN_TASK if no task_id provided
        const taskId = params.task_id || process.env.HERMES_KANBAN_TASK;
        if (!taskId) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: No task_id provided and HERMES_KANBAN_TASK not set.",
              },
            ],
            details: { tool: "kanban_complete", error: "No task ID" },
          };
        }

        if (!(await service.isWriteAvailable())) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: hermes CLI not found. Write operations require the hermes CLI in PATH.",
              },
            ],
            details: { tool: "kanban_complete", error: "hermes CLI not found" },
          };
        }

        const result = await service.completeTask({
          taskId,
          summary: params.summary,
          result: params.result,
          createdCards: params.created_cards,
        });

        if (!result.ok) {
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error}` }],
            details: { tool: "kanban_complete", error: result.error, code: result.code },
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Task ${taskId} marked as done.${params.summary ? `\n\nSummary: ${params.summary}` : ""}`,
            },
          ],
          details: {
            tool: "kanban_complete",
            success: true,
            task_id: taskId,
            board: service.board,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_complete", error: message },
        };
      }
    },
  });
}
