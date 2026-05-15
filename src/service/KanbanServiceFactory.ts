/**
 * KanbanServiceFactory — Per-board service cache
 * 
 * Ensures only one KanbanService per board, cached in memory.
 * Connections are closed on extension shutdown.
 */

import { KanbanService } from "./KanbanService.js";

const services = new Map<string, KanbanService>();

/**
 * Resolve the default board from environment or "default"
 */
export function resolveDefaultBoard(): string {
  return process.env.HERMES_KANBAN_BOARD || "default";
}

/**
 * Get or create a KanbanService for a board
 */
export function getService(board?: string): KanbanService {
  const b = board || resolveDefaultBoard();
  if (!services.has(b)) {
    services.set(b, new KanbanService(b));
  }
  return services.get(b)!;
}

/**
 * Close all board connections
 */
export function closeAllServices(): void {
  for (const [board, service] of services) {
    try {
      service.close();
    } catch (err) {
      console.warn(`[hermes-kanban] Error closing service for board ${board}:`, err);
    }
  }
  services.clear();
}

/**
 * Get all active boards
 */
export function getActiveBoards(): string[] {
  return Array.from(services.keys());
}

/**
 * Switch the current board (returns new service)
 */
export function switchBoard(board: string): KanbanService {
  const service = getService(board);
  // Update env for CLI commands
  process.env.HERMES_KANBAN_BOARD = board;
  return service;
}
