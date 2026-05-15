/**
 * Structured error types for Hermes Kanban extension
 */

export enum KanbanErrorCode {
  // Not found
  TASK_NOT_FOUND = "TASK_NOT_FOUND",
  ASSIGNEE_NOT_FOUND = "ASSIGNEE_NOT_FOUND",
  BOARD_NOT_FOUND = "BOARD_NOT_FOUND",
  
  // CLI issues
  CLI_NOT_FOUND = "CLI_NOT_FOUND",
  CLI_ERROR = "CLI_ERROR",
  CLI_TIMEOUT = "CLI_TIMEOUT",
  
  // Database
  DB_ERROR = "DB_ERROR",
  DB_NOT_FOUND = "DB_NOT_FOUND",
  
  // Validation
  VALIDATION_ERROR = "VALIDATION_ERROR",
  CYCLE_DETECTED = "CYCLE_DETECTED",
  
  // Task state
  HALLUCINATED_CARDS = "HALLUCINATED_CARDS",
  ALREADY_COMPLETED = "ALREADY_COMPLETED",
  ALREADY_BLOCKED = "ALREADY_BLOCKED",
  
  // Unknown
  UNKNOWN = "UNKNOWN",
}

/**
 * Extension-specific error with structured code and context
 */
export class KanbanError extends Error {
  constructor(
    message: string,
    public code: KanbanErrorCode,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "KanbanError";
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.message,
      code: this.code,
      ...this.context,
    };
  }
}

/**
 * Result type for operations that can fail
 */
export interface Result<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: KanbanErrorCode;
}

/**
 * Create a success result
 */
export function success<T>(data: T): Result<T> {
  return { ok: true, data };
}

/**
 * Create a failure result
 */
export function failure(error: string, code?: KanbanErrorCode): Result {
  return { ok: false, error, code };
}

/**
 * Convert an error to a failure result
 */
export function fromError(error: unknown, defaultCode = KanbanErrorCode.UNKNOWN): Result {
  if (error instanceof KanbanError) {
    return { ok: false, error: error.message, code: error.code };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message, code: defaultCode };
}
