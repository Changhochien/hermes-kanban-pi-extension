/**
 * /kanban-stats command — Quick stats display
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { KanbanService } from "../service/KanbanService.js";

export function registerKanbanStatsCommand(
  pi: ExtensionAPI,
  getService: () => KanbanService
): void {
  pi.registerCommand("kanban-stats", {
    description: "Show Kanban board statistics and workload distribution",
    async handler(_args, ctx) {
      try {
        const service = getService();
        const stats = service.getStats();

        let message = "📊 Kanban Statistics\n";
        message += "─".repeat(50) + "\n\n";

        message += `**Total Tasks:** ${stats.total}\n\n`;

        message += "**By Status:**\n";
        const statusOrder = [
          "triage", "todo", "ready", "running", "blocked", "done"
        ] as const;

        for (const status of statusOrder) {
          const count = stats.by_status[status] || 0;
          if (count > 0) {
            const emoji =
              status === "running" ? "⚡" :
              status === "blocked" ? "🚫" :
              status === "done" ? "✅" : "○";
            message += `  ${emoji} ${status}: ${count}\n`;
          }
        }

        if (Object.keys(stats.by_assignee).length > 0) {
          message += "\n**By Assignee:**\n";
          const sorted = Object.entries(stats.by_assignee)
            .sort((a, b) => b[1] - a[1]);

          for (const [assignee, count] of sorted) {
            message += `  👤 ${assignee}: ${count}\n`;
          }
        }

        if (stats.oldest_ready_age_seconds !== null) {
          const minutes = Math.floor(stats.oldest_ready_age_seconds / 60);
          message += `\n**Oldest Ready:** ${minutes}m ago\n`;
        }

        ctx.ui.notify(message, "info");
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Failed to load stats";
        ctx.ui.notify(`Kanban Error: ${message}`, "error");
      }
    },
  });
}
