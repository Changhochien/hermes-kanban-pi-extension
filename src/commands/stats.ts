/**
 * /kanban-stats command — Quick stats display
 */

import type { Command } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

export const kanbanStatsCommand: Command = {
  name: "kanban-stats",
  description: "Get board statistics: task counts by status and assignee",
  async execute(_args, ctx) {
    try {
      const service = getService();
      const stats = service.getStats();
      const output = service.formatStats(stats);

      await ctx.ui.notify(output, "info");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.ui.notify(`Error: ${message}`, "error");
    }
  },
};
