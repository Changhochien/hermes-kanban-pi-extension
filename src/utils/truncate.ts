/**
 * Output truncation utilities for pi tool results
 * 
 * pi requires tools to truncate output to:
 * - Max 50 KB per result
 * - Max 2000 lines per result
 */

const MAX_BYTES = 50 * 1024;      // 50 KB
const MAX_LINES = 2000;

/**
 * Truncate text to fit within pi limits.
 * Prioritizes showing the beginning and end of content.
 */
export function truncateOutput(text: string, options?: {
  maxBytes?: number;
  maxLines?: number;
  showTail?: boolean;
}): string {
  const maxBytes = options?.maxBytes ?? MAX_BYTES;
  const maxLines = options?.maxLines ?? MAX_LINES;
  const showTail = options?.showTail ?? true;

  let result = text;

  // Truncate by bytes
  if (result.length > maxBytes) {
    if (showTail) {
      // Show head + tail
      const headSize = Math.floor(maxBytes / 2) - 50;
      const tailSize = maxBytes - headSize - 100;
      result = (
        result.slice(0, headSize) +
        "\n... (middle truncated) ...\n" +
        result.slice(-tailSize)
      );
    } else {
      result = result.slice(0, maxBytes) + "\n... (truncated)";
    }
  }

  // Truncate by lines
  const lines = result.split("\n");
  if (lines.length > maxLines) {
    const keepFirst = Math.floor(maxLines / 2) - 2;
    const keepLast = Math.floor(maxLines / 2) - 2;
    
    result = [
      ...lines.slice(0, keepFirst),
      `... (${lines.length - maxLines} lines truncated) ...`,
      ...lines.slice(-keepLast),
    ].join("\n");
  }

  return result;
}

/**
 * Truncate a single value (for JSON objects)
 */
export function truncateValue(value: unknown, maxLength = 1000): string {
  const str = typeof value === "string" ? value : JSON.stringify(value);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + "...";
}

/**
 * Format file size for display
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
