/**
 * kanban_heartbeat — Send worker heartbeat to prevent stale detection
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export default function registerHeartbeatTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_heartbeat",
    description:
      "Send a heartbeat ping for a running task to prevent it from being marked as stale. " +
      "Use during long-running operations to keep the task active. " +
      "If no task_id is provided, uses the HERMES_KANBAN_TASK environment variable.",
    parameters: {
      board: {
        type: "string" as const,
        description: "Board name (defaults to current board)",
      }.optional(),
      task_id: {
        type: "string" as const,
        description: "Task ID to send heartbeat for (optional, uses HERMES_KANBAN_TASK if not set)",
      }.optional(),
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
            details: { tool: "kanban_heartbeat", error: "No task ID" },
          };
        }

        const result = await service.heartbeat(taskId);

        if (!result.ok) {
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error}` }],
            details: { tool: "kanban_heartbeat", error: result.error, code: result.code },
          };
        }

        return {
          content: [{ type: "text" as const, text: `Heartbeat sent for ${result.data?.taskId}` }],
          details: { tool: "kanban_heartbeat", success: true, task_id: result.data?.taskId },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_heartbeat", error: message },
        };
      }
    },
  });
}
