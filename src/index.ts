/**
 * hermes-kanban-pi-extension — Hermes Kanban integration for pi agent
 * 
 * Features:
 * - 14 kanban tools (read + write)
 * - 4 slash commands (/kanban-board, /kanban-stats, /kanban-web, /kanban-switch)
 * - Multi-board support (board param on all tools)
 * - pi as Hermes worker (auto-context injection, completion detection)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService, closeAllServices, resolveDefaultBoard } from "./service/KanbanServiceFactory.js";

// --- Tools ---
import { registerKanbanListTool } from "./tools/list.js";
import { registerKanbanBoardTool } from "./tools/board.js";
import { registerKanbanShowTool } from "./tools/show.js";
import { registerKanbanStatsTool } from "./tools/stats.js";
import { registerKanbanDiagnosticsTool } from "./tools/diagnostics.js";
import { registerKanbanCreateTool } from "./tools/create.js";
import { registerKanbanCompleteTool } from "./tools/complete.js";
import { registerKanbanBlockTool } from "./tools/block.js";
import { registerKanbanCommentTool } from "./tools/comment.js";
import { registerKanbanLinkTool } from "./tools/link.js";
import registerHeartbeatTool from "./tools/heartbeat.js";
import registerReclaimTool from "./tools/reclaim.js";
import registerBoardsTool from "./tools/boards.js";
import registerWorkerContextTool from "./tools/worker_context.js";

// --- Commands ---
import { kanbanBoardCommand } from "./commands/board.js";
import { kanbanStatsCommand } from "./commands/stats.js";
import { kanbanWebCommand } from "./commands/web.js";
import { kanbanSwitchCommand } from "./commands/switch.js";

// --- Completion detection patterns ---
const COMPLETION_SIGNALS = [
  /\b(done|complete|finished|all done)\b/i,
  /\b(can't proceed|cannot proceed|unable to|no longer needed)\b/i,
  /\bfinal(ly)? complete[dr]?\b/i,
];

// Cached worker context for injection
let cachedWorkerContext: string | null = null;

/**
 * Extract text content from a message
 */
function extractMessageText(message: { content?: Array<{ type?: string; text?: string }> }): string {
  if (!message.content) return "";
  return message.content
    .filter((c) => c.type === "text")
    .map((c) => c.text || "")
    .join("");
}

/**
 * Check if a tool was called in this turn
 */
function wasToolCalled(toolResults: Array<{ toolCallId?: string; toolName?: string }>, toolName: string): boolean {
  return toolResults.some((r) => r.toolName === toolName);
}

/**
 * Register all kanban tools with pi
 */
function registerTools(pi: ExtensionAPI): void {
  // Read tools
  registerKanbanListTool(pi);
  registerKanbanBoardTool(pi);
  registerKanbanShowTool(pi);
  registerKanbanStatsTool(pi);
  registerKanbanDiagnosticsTool(pi);

  // Write tools
  registerKanbanCreateTool(pi);
  registerKanbanCompleteTool(pi);
  registerKanbanBlockTool(pi);
  registerKanbanCommentTool(pi);
  registerKanbanLinkTool(pi);

  // v2 tools
  registerHeartbeatTool(pi);
  registerReclaimTool(pi);
  registerBoardsTool(pi);
  registerWorkerContextTool(pi);
}

/**
 * Register all commands with pi (two-arg form)
 */
function registerCommands(pi: ExtensionAPI): void {
  // kanban-board command
  pi.registerCommand("kanban-board", {
    description: kanbanBoardCommand.description,
    handler: async (args, ctx) => {
      try {
        const service = getService();
        const result = service.getBoard();
        const output = service.formatBoard(result);
        await ctx.ui.notify(output, "info");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await ctx.ui.notify(`Error: ${message}`, "error");
      }
    },
  });

  // kanban-stats command
  pi.registerCommand("kanban-stats", {
    description: kanbanStatsCommand.description,
    handler: async (args, ctx) => {
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
  });

  // kanban-web command
  pi.registerCommand("kanban-web", {
    description: kanbanWebCommand.description,
    handler: kanbanWebCommand.execute,
  });

  // kanban-switch command
  pi.registerCommand("kanban-switch", {
    description: kanbanSwitchCommand.description,
    handler: kanbanSwitchCommand.execute,
  });
}

/**
 * Extension entry point
 */
export default function registerExtension(pi: ExtensionAPI): void {
  try {
    // Register tools and commands
    registerTools(pi);
    registerCommands(pi);

    // Log successful registration
    console.log(
      `[hermes-kanban] Extension loaded. Board: ${resolveDefaultBoard()}`
    );

    // --- Event hooks ---

    // session_start: Initialize and cache worker context if running as worker
    pi.on("session_start", async (_event, _ctx) => {
      console.log("[hermes-kanban] Session starting...");

      // Initialize service for default board
      const service = getService();

      // Check if running as Hermes worker
      const taskId = process.env.HERMES_KANBAN_TASK;
      if (taskId) {
        try {
          cachedWorkerContext = service.formatWorkerContext();
          console.log(`[hermes-kanban] Worker context cached for task: ${taskId}`);
        } catch (err) {
          console.warn("[hermes-kanban] Failed to cache worker context:", err);
        }
      }
    });

    // before_agent_start: Inject worker context into system prompt
    pi.on("before_agent_start", (event) => {
      if (cachedWorkerContext) {
        // Inject worker context into the system prompt
        const currentPrompt = event.systemPrompt || "";
        event.systemPrompt = `${currentPrompt}\n\n${cachedWorkerContext}`;
        console.log("[hermes-kanban] Worker context injected into system prompt");
      }
    });

    // turn_end: Detect completion signals
    pi.on("turn_end", async (event) => {
      // Skip if no worker task
      if (!process.env.HERMES_KANBAN_TASK) return;

      // Check if kanban_complete was called in this turn
      const toolResults = event.toolResults || [];
      if (wasToolCalled(toolResults, "kanban_complete")) return;

      // Check assistant response for completion signals
      const responseText = extractMessageText(event.message);
      for (const pattern of COMPLETION_SIGNALS) {
        if (pattern.test(responseText)) {
          // Inject steer message via pi.sendMessage
          const steerMessage =
            "[Kanban Worker] You appear to have finished your work. " +
            "Would you like me to call `kanban_complete()` with a summary?";
          pi.sendMessage(
            { customType: "kanban-worker", content: steerMessage, display: true },
            { deliverAs: "steer" }
          );
          console.log("[hermes-kanban] Completion signal detected, injecting steer");
          break;
        }
      }
    });

    // agent_end: Cleanup (runs after agent completes)
    pi.on("agent_end", () => {
      console.log("[hermes-kanban] Agent ending...");
    });

    // session_shutdown: Close all connections
    pi.on("session_shutdown", () => {
      console.log("[hermes-kanban] Shutting down, closing connections...");
      closeAllServices();
      cachedWorkerContext = null;
    });

  } catch (err) {
    console.error("[hermes-kanban] Failed to register extension:", err);
    throw err;
  }
}
