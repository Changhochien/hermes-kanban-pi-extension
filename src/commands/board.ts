/**
 * /kanban-board command — Quick board overview
 */

import type { Command, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export const kanbanBoardCommand: Command = {
  name: "kanban-board",
  description: "Quick overview of the kanban board with tasks grouped by status",
  async execute(ctx) {
    try {
      const service = getService();
      const result = service.getBoard();
      const output = service.formatBoard(result);

      await ctx.reply(output);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.reply(`Error: ${message}`);
    }
  },
};
