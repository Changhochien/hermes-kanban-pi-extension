/**
 * SQLite database connection management
 * 
 * Connection lifecycle:
 * - Connections are created per-board and cached
 * - SQLite WAL mode is set for new connections
 * - Connections are closed on extension shutdown
 */

import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { getKanbanDbPath } from "../utils/board-resolve.js";

// Per-board connection cache
const connections = new Map<string, Database>();

/**
 * Get or create a database connection for a board
 */
export function getConnection(board: string = "default"): Database {
  if (connections.has(board)) {
    return connections.get(board)!;
  }

  const dbPath = getKanbanDbPath(board);
  
  // Check if database exists
  if (!existsSync(dbPath)) {
    throw new Error(`Kanban database not found: ${dbPath}`);
  }

  // Open in readonly mode for safety
  // Note: We deliberately DO NOT set WAL mode here — 
  // WAL mode cannot be set on a readonly connection and is unnecessary for reads
  const db = new Database(dbPath, { readonly: true });

  // Set busy timeout for concurrent access
  db.pragma("busy_timeout = 5000");

  // Enable strict mode for better error messages
  db.pragma("strict = ON");

  connections.set(board, db);
  return db;
}

/**
 * Close a specific board's connection
 */
export function closeConnection(board: string): void {
  const db = connections.get(board);
  if (db) {
    db.close();
    connections.delete(board);
  }
}

/**
 * Close all open connections
 */
export function closeAllConnections(): void {
  for (const [board, db] of connections) {
    try {
      db.close();
    } catch (err) {
      console.warn(`[hermes-kanban] Error closing ${board}:`, err);
    }
  }
  connections.clear();
}

/**
 * Check if a connection exists for a board
 */
export function hasConnection(board: string): boolean {
  return connections.has(board);
}

/**
 * Get all open board connections
 */
export function getOpenBoards(): string[] {
  return Array.from(connections.keys());
}

/**
 * Execute a read-only query with error handling
 */
export function query<T>(
  board: string,
  sql: string,
  params: unknown[] = []
): T[] {
  const db = getConnection(board);
  try {
    return db.prepare(sql).all(...params) as T[];
  } catch (err) {
    throw new Error(`Query failed: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Execute a single-row read query
 */
export function queryOne<T>(
  board: string,
  sql: string,
  params: unknown[] = []
): T | undefined {
  const db = getConnection(board);
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } catch (err) {
    throw new Error(`Query failed: ${err instanceof Error ? err.message : err}`);
  }
}
