/**
 * kanban_complete tool — Mark a task as completed
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KanbanService } from "../service/KanbanService.js";

export function registerKanbanCompleteTool(
  pi: ExtensionAPI,
  getService: () => KanbanService
): void {
  pi.registerTool({
    name: "kanban_complete",
    label: "Kanban Complete",
    description: `Mark a task as completed with a structured handoff summary.
The summary appears in downstream worker context and dashboard.
Include metadata about what was done for future reference.

Required: task_id (or HERMES_KANBAN_TASK env var) and summary
Optional: metadata (structured facts), created_cards (tasks created during work)`,
    promptSnippet: "Complete kanban task",
    promptGuidelines: [
      "Use kanban_complete when a task is finished",
      "Include a summary describing what was accomplished",
      "Include metadata about files changed, tests run, etc.",
    ],
    parameters: {
      task_id: { type: "string" as const, description: "Task ID to complete (defaults to HERMES_KANBAN_TASK env)" }.optional(),
      summary: { type: "string" as const, description: "1-3 sentence description of what was accomplished" }.optional(),
      metadata: { type: "object" as const, description: "Structured facts about the work" }.optional(),
      result: { type: "string" as const, description: "Legacy result line" }.optional(),
      created_cards: { type: "array" as const, items: { type: "string" as const }, description: "Task IDs created during this work" }.optional(),
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService();

        // Resolve task ID
        const taskId = params.task_id || process.env.HERMES_KANBAN_TASK;
        if (!taskId) {
          return {
            content: [{ type: "text" as const, text: "Error: task_id is required (or set HERMES_KANBAN_TASK env var)" }],
            details: { tool: "kanban_complete", error: "task_id required" },
          };
        }

        if (!(await service.isWriteAvailable())) {
          return {
            content: [{ type: "text" as const, text: "Error: hermes CLI not found" }],
            details: { tool: "kanban_complete", error: "hermes CLI not found" },
          };
        }

        const result = await service.completeTask({
          taskId,
          summary: params.summary,
          metadata: params.metadata,
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
          content: [{ type: "text" as const, text: `Task ${taskId} marked as complete.` }],
          details: { tool: "kanban_complete", success: true, task_id: taskId },
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
