/**
 * kanban_reclaim — Take over a stuck task from another worker
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export default function registerReclaimTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_reclaim",
    description:
      "Reclaim a task that another worker abandoned or left stuck. " +
      "Useful when kanban_diagnostics shows a stale running task and you want to take it over. " +
      "The task must be in 'running' status to be reclaimed.",
    parameters: {
      board: { type: "string", description: "Board name (defaults to current board)" },
      task_id: { type: "string", description: "Task ID to reclaim" },
      reason: { type: "string", description: "Optional reason for reclaiming (e.g., 'Original worker abandoned task')" },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);

        const result = await service.reclaimTask(params.task_id, params.reason);

        if (!result.ok) {
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error}` }],
            details: { tool: "kanban_reclaim", error: result.error, code: result.code },
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Task ${params.task_id} reclaimed successfully. It is now in 'ready' status and can be picked up by a worker.`,
            },
          ],
          details: { tool: "kanban_reclaim", success: true, task_id: params.task_id },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_reclaim", error: message },
        };
      }
    },
  });
}
