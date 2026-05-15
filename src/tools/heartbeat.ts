/**
 * kanban_heartbeat — Send worker heartbeat to prevent stale detection
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export default function registerHeartbeatTool(ctx: ExtensionContext): void {
  ctx.registerTool({
    name: "kanban_heartbeat",
    description:
      "Send a heartbeat ping for a running task to prevent it from being marked as stale. " +
      "Use during long-running operations to keep the task active. " +
      "If no task_id is provided, uses the HERMES_KANBAN_TASK environment variable.",
    parameters: {
      task_id: {
        type: "string" as const,
        description: "Task ID to send heartbeat for (optional, uses HERMES_KANBAN_TASK if not set)",
      }.optional(),
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);

        const result = await service.heartbeat(params.task_id);

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
