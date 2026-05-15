/**
 * kanban_stats tool — Get board statistics
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export function registerKanbanStatsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_stats",
    label: "Kanban Stats",
    description: `Get board statistics: task counts by status, tasks per assignee, 
and age of oldest ready task. Useful for workload balancing and identifying bottlenecks.

Use this to:
- Check workload distribution across workers
- Identify bottlenecks (oldest ready tasks)
- Get quick board health overview
- Monitor progress (done vs total)`,
    promptSnippet: "Get kanban stats",
    promptGuidelines: [
      "Use kanban_stats when asked for board statistics",
      "Use kanban_stats to check workload balance",
      "Use kanban_board for detailed task listing",
    ],
    parameters: {
      board: {
        type: "string" as const,
        description: "Board name (defaults to current board)",
      }.optional(),
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);
        const stats = service.getStats();
        const output = service.formatStats(stats);

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            tool: "kanban_stats",
            board: service.board,
            stats,
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
