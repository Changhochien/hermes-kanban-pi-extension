/**
 * kanban_comment tool — Add a comment to a task
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KanbanService } from "../service/KanbanService.js";

export function registerKanbanCommentTool(
  pi: ExtensionAPI,
  getService: () => KanbanService
): void {
  pi.registerTool({
    name: "kanban_comment",
    label: "Kanban Comment",
    description: `Add a comment to a task's thread. Comments are included 
in downstream worker context and persist across runs. Use for notes, 
questions, findings, or information that should outlive this run.

Markdown is supported in comment bodies.`,
    promptSnippet: "Add kanban comment",
    promptGuidelines: [
      "Use kanban_comment to add notes or questions to a task",
      "Use kanban_comment to record progress or findings",
      "Comments are visible to downstream workers",
    ],
    parameters: {
      task_id: { type: "string" as const, description: "Task ID to comment on" },
      body: { type: "string" as const, description: "Comment text (markdown supported)" },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService();

        if (!(await service.isWriteAvailable())) {
          return {
            content: [{ type: "text" as const, text: "Error: hermes CLI not found" }],
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
          content: [{ type: "text" as const, text: `Comment added to task ${params.task_id}.` }],
          details: { tool: "kanban_comment", success: true, task_id: params.task_id, comment_id: result.data?.commentId },
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
