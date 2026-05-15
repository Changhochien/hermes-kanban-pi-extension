/**
 * Hermes Kanban Pi Extension
 * 
 * Main entry point. Registers lifecycle hooks and all kanban tools.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { KanbanService } from "./service/KanbanService.js";
import { closeAllConnections } from "./db/connection.js";

// Service instance — initialized on session_start, cleared on shutdown
let kanbanService: KanbanService | null = null;

/**
 * Get the current KanbanService instance.
 * Throws if not initialized.
 */
export function getKanbanService(): KanbanService {
  if (!kanbanService) {
    throw new Error(
      "Kanban service not initialized. " +
      "This may indicate a session issue. Try /new or /reload."
    );
  }
  return kanbanService;
}

/**
 * Check if service is available (for graceful degradation).
 */
export function hasKanbanService(): boolean {
  return kanbanService !== null;
}

/**
 * Resolve the active board name.
 */
function resolveBoard(): string {
  // Priority: HERMES_KANBAN_BOARD env > default
  return process.env.HERMES_KANBAN_BOARD || "default";
}

/**
 * Initialize the Hermes Kanban extension.
 */
export default async function hermesKanbanExtension(pi: ExtensionAPI): Promise<void> {
  console.log("[hermes-kanban] Initializing extension...");

  // --- Session lifecycle hooks ---

  // Initialize service when session starts
  pi.on("session_start", async (_event) => {
    const board = resolveBoard();
    try {
      kanbanService = new KanbanService(board);
      console.log(`[hermes-kanban] Connected to board: ${board}`);
    } catch (error) {
      console.error("[hermes-kanban] Failed to connect:", error);
      // Don't rethrow — allow extension to load even if DB unavailable
      // Tools will report the error gracefully
      kanbanService = null;
    }
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async (_event) => {
    console.log("[hermes-kanban] Shutting down...");
    kanbanService = null;
    closeAllConnections();
  });

  // Handle /reload — shutdown before restart
  pi.on("session_before_switch", async () => {
    kanbanService = null;
    closeAllConnections();
  });

  // --- Register tools ---
  // Import and register each tool, catching failures individually
  // so one bad tool doesn't prevent others from loading.

  const toolRegisters = [
    // Read tools
    import("./tools/list.js"),
    import("./tools/board.js"),
    import("./tools/show.js"),
    import("./tools/stats.js"),
    import("./tools/diagnostics.js"),
    // Write tools
    import("./tools/create.js"),
    import("./tools/complete.js"),
    import("./tools/block.js"),
    import("./tools/comment.js"),
    import("./tools/link.js"),
  ];

  for (const toolModule of toolRegisters) {
    try {
      const mod = await toolModule;
      const registerFn = mod.registerTool;
      if (typeof registerFn === "function") {
        registerFn(pi, getKanbanService);
      }
    } catch (error) {
      console.error("[hermes-kanban] Failed to register tool:", error);
      // Continue with remaining tools
    }
  }

  // --- Register commands ---
  try {
    const { registerKanbanBoardCommand } = await import("./commands/board.js");
    registerKanbanBoardCommand(pi, getKanbanService);
  } catch (error) {
    console.error("[hermes-kanban] Failed to register /kanban-board:", error);
  }

  try {
    const { registerKanbanStatsCommand } = await import("./commands/stats.js");
    registerKanbanStatsCommand(pi, getKanbanService);
  } catch (error) {
    console.error("[hermes-kanban] Failed to register /kanban-stats:", error);
  }

  console.log("[hermes-kanban] Extension loaded successfully");
}
