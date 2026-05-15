/**
 * CLI output parsing utilities
 */

/**
 * Parse a task ID from CLI output
 */
export function parseTaskId(output: string): string | null {
  // Match patterns like "t_12345678" or "Created task t_12345678"
  const match = output.match(/t_[a-f0-9]{8}/);
  return match ? match[0] : null;
}

/**
 * Parse a comment ID from CLI output
 */
export function parseCommentId(output: string): number | null {
  const match = output.match(/comment[_\s]*id[:\s]*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Parse CLI error for common patterns
 */
export function parseCliError(stderr: string): { code: string; message: string } {
  if (stderr.includes("not found") || stderr.includes("does not exist")) {
    return { code: "NOT_FOUND", message: stderr };
  }
  if (stderr.includes("permission") || stderr.includes("denied")) {
    return { code: "PERMISSION_DENIED", message: stderr };
  }
  if (stderr.includes("cycle")) {
    return { code: "CYCLE_DETECTED", message: "Link would create a dependency cycle" };
  }
  return { code: "CLI_ERROR", message: stderr };
}
