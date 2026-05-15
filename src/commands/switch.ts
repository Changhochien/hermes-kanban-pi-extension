/**
 * /kanban-switch command — Switch the active board
 */

import type { Command } from "@earendil-works/pi-coding-agent";
import { getService, getActiveBoards, switchBoard } from "../service/KanbanServiceFactory.js";

export const kanbanSwitchCommand: Command = {
  name: "kanban-switch",
  description: "Switch the active kanban board",
  async execute(args, ctx) {
    const board = (args || "").trim();

    // Get available boards
    const service = getService();
    const availableBoards = service.getBoards();
    const boardNames = availableBoards.map((b) => b.slug);
    const activeBoards = getActiveBoards();

    if (!board) {
      // Show available boards
      let output = "**Available boards:**\n\n";
      for (const b of availableBoards) {
        const isActive = activeBoards.includes(b.slug);
        const marker = isActive ? " (current)" : "";
        output += `- ${b.slug}${marker} — ${b.taskCount} tasks\n`;
      }
      output += "\nUse `/kanban-switch [board-name]` to switch.";
      await ctx.reply(output);
      return;
    }

    // Check if board exists
    if (!boardNames.includes(board)) {
      await ctx.reply(`Board "${board}" not found. Available boards: ${boardNames.join(", ")}`);
      return;
    }

    // Switch board
    const newService = switchBoard(board);
    await ctx.reply(`Switched to board: ${board}\n\nUse kanban tools to interact with this board.`);
  },
};
