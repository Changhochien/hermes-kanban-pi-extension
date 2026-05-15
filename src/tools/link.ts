/**
 * kanban_link tool — Create parent→child dependency links
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KanbanService } from "../service/KanbanService.js";

export function registerKanbanLinkTool(
  pi: ExtensionAPI,
  getService: () => KanbanService
): void {
  pi.registerTool({
    name: "kanban_link",
    label: "Kanban Link",
    description: `Create a parent→child dependency link between tasks.
The child task won't promote to 'ready' status until all parent 
tasks are marked 'done'. This enables automatic sequencing of 
related tasks.`,
    promptSnippet: "Link kanban tasks",
    promptGuidelines: [
      "Use kanban_link to create dependencies between tasks",
      "The child won't run until all parents are done",
      "Use when setting up pipelines or multi-step workflows",
    ],
    parameters: {
      parent_id: { type: "string" as const, description: "Parent task ID (must already exist)" },
      child_id: { type: "string" as const, description: "Child task ID (must already exist)" },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService();

        if (!(await service.isWriteAvailable())) {
          return {
            content: [{ type: "text" as const, text: "Error: hermes CLI not found" }],
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
          content: [{ type: "text" as const, text: `Linked: ${params.parent_id} → ${params.child_id}` }],
          details: { tool: "kanban_link", success: true, parent_id: params.parent_id, child_id: params.child_id },
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
