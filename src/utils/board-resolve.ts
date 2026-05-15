/**
 * Board path resolution utilities
 */

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

/**
 * Board slug validator
 * Boards must be lowercase alphanumerics + hyphens, 1-64 chars
 */
const BOARD_SLUG_REGEX = /^[a-z0-9][a-z0-9\-]{0,63}$/;

/**
 * Validate a board slug
 */
export function isValidBoardSlug(slug: string): boolean {
  return BOARD_SLUG_REGEX.test(slug);
}

/**
 * Get Hermes home directory
 */
export function getHermesHome(): string {
  return process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
}

/**
 * Get the path to the kanban.db for a board
 */
export function getKanbanDbPath(board: string = "default"): string {
  const home = getHermesHome();
  
  if (board === "default") {
    // Default board uses legacy path
    return path.join(home, "kanban.db");
  }
  
  // Named boards use boards/<slug> directory
  return path.join(home, "kanban", "boards", board, "kanban.db");
}

/**
 * Get the current board from the on-disk pointer
 */
export function getCurrentBoard(): string {
  const home = getHermesHome();
  const currentPath = path.join(home, "kanban", "current");
  
  try {
    const content = fs.readFileSync(currentPath, "utf-8").trim();
    if (content && isValidBoardSlug(content)) {
      return content;
    }
  } catch {
    // File doesn't exist or is invalid — use default
  }
  
  return "default";
}

/**
 * Resolve the active board name
 * Priority: env var > current file > default
 */
export function resolveBoard(): string {
  const envBoard = process.env.HERMES_KANBAN_BOARD;
  
  if (envBoard) {
    if (isValidBoardSlug(envBoard)) {
      return envBoard;
    }
    console.warn(`[hermes-kanban] Invalid board slug in HERMES_KANBAN_BOARD: ${envBoard}`);
  }
  
  return getCurrentBoard();
}

/**
 * Check if a board exists on disk
 */
export function boardExists(board: string): boolean {
  const dbPath = getKanbanDbPath(board);
  try {
    return fs.statSync(dbPath).isFile();
  } catch {
    return false;
  }
}

/**
 * Get workspaces root for a board
 */
export function getWorkspacesRoot(board: string = "default"): string {
  const home = getHermesHome();
  
  if (board === "default") {
    return path.join(home, "kanban", "workspaces");
  }
  
  return path.join(home, "kanban", "boards", board, "workspaces");
}

/**
 * Get logs directory for a board
 */
export function getLogsPath(board: string = "default"): string {
  const home = getHermesHome();
  
  if (board === "default") {
    return path.join(home, "kanban", "logs");
  }
  
  return path.join(home, "kanban", "boards", board, "logs");
}
