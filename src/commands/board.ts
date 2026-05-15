/**
 * /kanban-board command — Quick board overview
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KanbanService } from "../service/KanbanService.js";

export function registerKanbanBoardCommand(
  pi: ExtensionAPI,
  getService: () => KanbanService
): void {
  pi.registerCommand("kanban-board", {
    description: "Show Hermes Kanban board overview with tasks grouped by status",
    async handler(_args, ctx) {
      try {
        const service = getService();
        const { columns, stats } = service.getBoard();

        let message = "📋 Kanban Board Overview\n";
        message += "─".repeat(50) + "\n\n";

        for (const column of columns) {
          if (column.tasks.length > 0) {
            message += `**${column.name.toUpperCase()}** (${column.tasks.length})\n`;

            for (const task of column.tasks.slice(0, 5)) {
              const assignee = task.assignee ? ` @${task.assignee}` : "";
              const title = task.title.length > 40
                ? task.title.slice(0, 37) + "..."
                : task.title;
              message += `  • ${title}${assignee}\n`;
            }

            if (column.tasks.length > 5) {
              message += `  ... and ${column.tasks.length - 5} more\n`;
            }
            message += "\n";
          }
        }

        message += "─".repeat(50) + "\n";
        message += `Total: ${stats.total} tasks\n`;

        ctx.ui.notify(message, "info");
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Failed to load board";
        ctx.ui.notify(`Kanban Error: ${message}`, "error");
      }
    },
  });
}
