/**
 * kanban_link tool — Link tasks as parent/child dependencies
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export function registerKanbanLinkTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_link",
    label: "Kanban Link",
    description: `Create a parent-child dependency between two tasks.
The child task will be blocked until the parent is completed.
Useful for creating multi-step pipelines and task hierarchies.

Use this to:
- Create multi-step pipelines (research → analyze → report)
- Set up task dependencies
- Create subtasks under a parent
- Track work breakdown`,
    promptSnippet: "Link kanban tasks",
    promptGuidelines: [
      "Use kanban_link to create task dependencies",
      "Use kanban_link for multi-step pipelines",
      "Child tasks wait for parent to complete",
    ],
    parameters: {
      board: { type: "string", description: "Board name (defaults to current board)" },
      parent_id: { type: "string", description: "Parent task ID (must complete before child)" },
      child_id: { type: "string", description: "Child task ID (waits for parent)" },
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
            details: { tool: "kanban_link", error: "hermes CLI not found" },
          };
        }

        const result = await service.linkTasks({
          parentId: params.parent_id,
          childId: params.child_id,
        });

        if (!result.ok) {
          return {
            content: [{ type: "text" as const, text: `Error: ${result.error}` }],
            details: { tool: "kanban_link", error: result.error, code: result.code },
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Linked ${params.child_id} → ${params.parent_id}.\n${params.child_id} will wait for ${params.parent_id} to complete.`,
            },
          ],
          details: {
            tool: "kanban_link",
            success: true,
            parent_id: params.parent_id,
            child_id: params.child_id,
            board: service.board,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_link", error: message },
        };
      }
    },
  });
}
