/**
 * kanban_diagnostics tool — Check task health
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

const SEVERITIES = ["warning", "error", "critical"] as const;

export function registerKanbanDiagnosticsTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_diagnostics",
    label: "Kanban Diagnostics",
    description: `Check all tasks for distress signals: stale running tasks, 
repeated failures, hallucinated card references, spawn failures.
Returns actionable warnings grouped by severity (warning/error/critical).

Use this to:
- Detect tasks that need attention
- Find stale or abandoned tasks
- Identify hallucinated task IDs in comments
- Get health overview of the board`,
    promptSnippet: "Run kanban diagnostics",
    promptGuidelines: [
      "Use kanban_diagnostics to check for task health issues",
      "Use kanban_diagnostics after encountering errors",
      "Use kanban_reclaim to take over stale tasks",
    ],
    parameters: {
      type: "object",
      properties: {
        board: { type: "string", description: "Board name (defaults to current board)" },
        severity: { type: "string", enum: [...SEVERITIES], description: "Filter by severity" },
      },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);
        const diagnostics = service.getDiagnostics({
          severity: params.severity as typeof SEVERITIES[number] | undefined,
        });
        const output = service.formatDiagnostics(diagnostics);

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            tool: "kanban_diagnostics",
            board: service.board,
            issue_count: diagnostics.length,
            severity_filter: params.severity || "all",
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_diagnostics", error: message },
        };
      }
    },
  });
}
