/**
 * kanban_boards — List all available kanban boards
 */

import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export default function registerBoardsTool(ctx: ExtensionContext): void {
  ctx.registerTool({
    name: "kanban_boards",
    description:
      "List all available Hermes Kanban boards. " +
      "Use this to discover boards before using kanban_switch or when specifying the board parameter. " +
      "Returns board slug, path, and task count for each board.",
    parameters: {},
    async execute(_toolCallId, _params) {
      try {
        const service = getService();
        const boards = service.getBoards();

        if (boards.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No kanban boards found." }],
            details: { tool: "kanban_boards", boards: [] },
          };
        }

        let output = `**${boards.length} board(s) found**\n\n`;

        for (const board of boards) {
          const isDefault = board.slug === "default" ? " (default)" : "";
          output += `## ${board.slug}${isDefault}\n`;
          output += `- Path: ${board.path}\n`;
          output += `- Tasks: ${board.taskCount}\n\n`;
        }

        output += "Use `/kanban-switch [board]` to change the active board, " +
                  "or specify `board` parameter in any kanban tool.";

        return {
          content: [{ type: "text" as const, text: output }],
          details: { tool: "kanban_boards", boards },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_boards", error: message },
        };
      }
    },
  });
}
