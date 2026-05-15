/**
 * kanban_block tool — Block a task pending human input
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KanbanService } from "../service/KanbanService.js";

export function registerKanbanBlockTool(
  pi: ExtensionAPI,
  getService: () => KanbanService
): void {
  pi.registerTool({
    name: "kanban_block",
    label: "Kanban Block",
    description: `Block a task because you need human input to proceed.
The reason is shown on the board and in context when someone 
unblocks the task.

Required: task_id and reason`,
    promptSnippet: "Block kanban task",
    promptGuidelines: [
      "Use kanban_block when work cannot proceed without human input",
      "Provide a clear reason explaining what is needed",
      "Don't block on things you can resolve yourself",
    ],
    parameters: {
      task_id: { type: "string" as const, description: "Task ID to block (defaults to HERMES_KANBAN_TASK env)" }.optional(),
      reason: { type: "string" as const, description: "What input is needed to unblock (be specific)" },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService();

        const taskId = params.task_id || process.env.HERMES_KANBAN_TASK;
        if (!taskId) {
          return {
            content: [{ type: "text" as const, text: "Error: task_id is required (or set HERMES_KANBAN_TASK env var)" }],
            details: { tool: "kanban_block", error: "task_id required" },
          };
        }

        if (!(await service.isWriteAvailable())) {
          return {
            content: [{ type: "text" as const, text: "Error: hermes CLI not found" }],
            details: { tool: "kanban_block", error: "hermes CLI not found" },
          };
        }

        const result = await service.blockTask({
          taskId,
          reason: params.reason,
        });

        if (!result.ok) {
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error}` }],
            details: { tool: "kanban_block", error: result.error, code: result.code },
          };
        }

        return {
          content: [{ type: "text" as const, text: `Task ${taskId} blocked.\n\nReason: ${params.reason}` }],
          details: { tool: "kanban_block", success: true, task_id: taskId },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_block", error: message },
        };
      }
    },
  });
}
