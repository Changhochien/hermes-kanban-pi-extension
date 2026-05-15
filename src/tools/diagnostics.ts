/**
 * kanban_diagnostics tool — Check for task health issues
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import type { KanbanService } from "../service/KanbanService.js";

export function registerKanbanDiagnosticsTool(
  pi: ExtensionAPI,
  getService: () => KanbanService
): void {
  pi.registerTool({
    name: "kanban_diagnostics",
    label: "Kanban Diagnostics",
    description: `Check all tasks for distress signals and health issues.
Detects:
- Stale running tasks (no heartbeat for extended time)
- Repeated failures (3+ failed attempts)

Returns actionable warnings with severity levels.`,
    promptSnippet: "Kanban diagnostics",
    promptGuidelines: [
      "Use kanban_diagnostics to check for task health issues",
      "Use kanban_diagnostics to find stuck or failing tasks",
    ],
    parameters: {
      severity: StringEnum(["warning", "error", "critical"] as const).optional(),
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService();
        const diagnostics = service.getDiagnostics({ severity: params.severity });
        const output = service.formatDiagnostics(diagnostics);

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            tool: "kanban_diagnostics",
            issues: diagnostics.length,
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
