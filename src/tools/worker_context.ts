/**
 * kanban_worker_context — Get the current task context when running as a Hermes worker
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";
import { truncateOutput } from "../utils/truncate.js";

export default function registerWorkerContextTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_worker_context",
    description:
      "Get the current task context when running as a Hermes worker. " +
      "Reads the HERMES_KANBAN_TASK environment variable and returns full task details. " +
      "Use this to understand what task you've been assigned to work on. " +
      "This information is also automatically injected at session start.",
    parameters: {},
    async execute(_toolCallId, _params) {
      try {
        const service = getService();
        const context = service.getWorkerContext();

        if (!context) {
          const taskId = process.env.HERMES_KANBAN_TASK;
          return {
            content: [
              {
                type: "text" as const,
                text: taskId
                  ? `Task ${taskId} not found in database.`
                  : "HERMES_KANBAN_TASK not set. Not running as a Hermes worker.",
              },
            ],
            details: { tool: "kanban_worker_context", found: false },
          };
        }

        // Format the context
        const formatted = service.formatWorkerContext();

        return {
          content: [{ type: "text" as const, text: truncateOutput(formatted) }],
          details: {
            tool: "kanban_worker_context",
            found: true,
            task_id: context.task.id,
            status: context.task.status,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_worker_context", error: message },
        };
      }
    },
  });
}
