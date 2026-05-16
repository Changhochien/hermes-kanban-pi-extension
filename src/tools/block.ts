/**
 * kanban_block tool — Block a task pending input
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export function registerKanbanBlockTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_block",
    label: "Kanban Block",
    description: `Block a task that is waiting for external input (human review, 
dependency completion, external system, etc.). The task stops running and
waits for the block to be resolved.

Use this to:
- Pause work waiting for human input
- Mark tasks waiting on dependencies
- Signal that something external is needed
- Prevent stale running detection`,
    promptSnippet: "Block kanban task",
    promptGuidelines: [
      "Use kanban_block when work is paused waiting for input",
      "Use kanban_block when something external is needed",
      "Use kanban_unblock when the block is resolved",
    ],
    parameters: {
      type: "object",
      properties: {
        board: { type: "string", description: "Board name (defaults to current board)" },
        task_id: { type: "string", description: "Task ID (t_<hex8>)" },
        reason: { type: "string", description: "Reason for blocking" },
      },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);

        if (!(await service.isWriteAvailable())) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Error: hermes CLI not found. Write operations require the hermes CLI in PATH.",
              },
            ],
            details: { tool: "kanban_block", error: "hermes CLI not found" },
          };
        }

        const result = await service.blockTask({
          taskId: params.task_id,
          reason: params.reason,
        });

        if (!result.ok) {
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error}` }],
            details: { tool: "kanban_block", error: result.error, code: result.code },
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Task ${params.task_id} blocked.\nReason: ${params.reason}\n\nUse kanban_comment to add more details, or unblock when resolved.`,
            },
          ],
          details: {
            tool: "kanban_block",
            success: true,
            task_id: params.task_id,
            board: service.board,
          },
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
