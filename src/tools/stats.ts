/**
 * kanban_stats tool — Get board statistics
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KanbanService } from "../service/KanbanService.js";

export function registerKanbanStatsTool(
  pi: ExtensionAPI,
  getService: () => KanbanService
): void {
  pi.registerTool({
    name: "kanban_stats",
    label: "Kanban Stats",
    description: `Get board statistics: task counts by status, tasks per 
assignee, and age of oldest ready task. Useful for workload 
balancing and board health monitoring.`,
    promptSnippet: "Kanban statistics",
    promptGuidelines: [
      "Use kanban_stats for quick board statistics",
      "Use kanban_stats to check workload distribution",
    ],
    parameters: {},
    async execute(_toolCallId, _params) {
      try {
        const service = getService();
        const stats = service.getStats();
        const output = service.formatStats(stats);

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            tool: "kanban_stats",
            total: stats.total,
            by_status: stats.by_status,
            by_assignee: stats.by_assignee,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_stats", error: message },
        };
      }
    },
  });
}
