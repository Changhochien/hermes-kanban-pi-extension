/**
 * kanban_comment tool — Add a comment to a task
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export function registerKanbanCommentTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_comment",
    label: "Kanban Comment",
    description: `Add a comment to a task's discussion thread.
Useful for providing updates, asking questions, or adding context.

Use this to:
- Provide progress updates
- Ask questions or request clarification
- Add context for other workers
- Record decisions or learnings`,
    promptSnippet: "Comment on kanban task",
    promptGuidelines: [
      "Use kanban_comment to add notes or updates",
      "Use kanban_comment to ask questions about a task",
      "Use kanban_show to read existing comments",
    ],
    parameters: {
      type: "object",
      properties: {
        board: { type: "string", description: "Board name (defaults to current board)" },
        task_id: { type: "string", description: "Task ID (t_<hex8>)" },
        body: { type: "string", description: "Comment text (markdown supported)" },
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
            details: { tool: "kanban_comment", error: "hermes CLI not found" },
          };
        }

        const result = await service.addComment({
          taskId: params.task_id,
          body: params.body,
        });

        if (!result.ok) {
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error}` }],
            details: { tool: "kanban_comment", error: result.error, code: result.code },
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Comment added to ${params.task_id}.`,
            },
          ],
          details: {
            tool: "kanban_comment",
            success: true,
            task_id: params.task_id,
            comment_id: result.data?.commentId,
            board: service.board,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_comment", error: message },
        };
      }
    },
  });
}
