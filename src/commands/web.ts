/**
 * /kanban-web command — Open Hermes dashboard in browser
 */

import { exec } from "node:child_process";
import type { Command } from "@earendil-works/pi-coding-agent";

const DASHBOARD_URL = "http://localhost:3000/kanban";

export const kanbanWebCommand: Command = {
  name: "kanban-web",
  description: "Open the Hermes Kanban dashboard in your browser",
  async execute(_args, ctx) {
    const openCommand = process.platform === "darwin" ? "open" : "xdg-open";

    return new Promise<void>((resolve) => {
      exec(`${openCommand} ${DASHBOARD_URL}`, (err) => {
        if (err) {
          ctx.reply(`Could not open browser. Visit: ${DASHBOARD_URL}`).then(() => resolve());
        } else {
          ctx.reply(`Opening ${DASHBOARD_URL}...`).then(() => resolve());
        }
      });
    });
  },
};
