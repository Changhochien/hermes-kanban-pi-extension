/**
 * kanban_board tool — Get full Kanban board grouped by column
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export function registerKanbanBoardTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_board",
    label: "Kanban Board",
    description: `Get the full Kanban board grouped by status column.
Returns tasks organized by triage/todo/ready/running/blocked/done 
with board statistics including counts by status, workload by assignee,
and age of the oldest ready task.

Use this to:
- Get a complete picture of the board state
- See all tasks across columns at once
- Check board statistics and workload distribution
- Monitor overall progress`,
    promptSnippet: "View kanban board",
    promptGuidelines: [
      "Use kanban_board when asked to show the full board",
      "Use kanban_board when asked about overall project status",
      "Use kanban_list for filtered views",
    ],
    parameters: {
      board: { type: "string", description: "Board name (defaults to current board)" },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);
        const result = service.getBoard();
        const output = service.formatBoard(result);

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            tool: "kanban_board",
            board: service.board,
            columns: result.columns.length,
            total: result.stats.total,
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_board", error: message },
        };
      }
    },
  });
}
