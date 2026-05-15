/**
 * kanban_list tool — List Hermes Kanban tasks with optional filters
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

const STATUSES = ["triage", "todo", "ready", "running", "blocked", "done", "archived"] as const;

export function registerKanbanListTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_list",
    label: "Kanban List",
    description: `List Hermes Kanban tasks with optional status/assignee filters. 
Returns compact task summaries with id, title, status, assignee, priority, 
and parent/child counts. Useful for discovering work to route or checking 
task status across the board.

Use this to:
- Find tasks ready for work
- Check what a specific worker is assigned
- Monitor tasks by status (running, blocked, done)
- Get an overview of board workload`,
    promptSnippet: "List kanban tasks",
    promptGuidelines: [
      "Use kanban_list when asked to list, show, or find kanban tasks",
      "Use kanban_list when asked about board status or workload",
      "Use kanban_show for detailed task information",
    ],
    parameters: {
      board: { type: "string", description: "Board name (defaults to current board)" },
      status: { type: "string", enum: STATUSES, description: "Filter by status" },
      assignee: { type: "string", description: "Filter by assignee profile" },
      tenant: { type: "string", description: "Filter by tenant/project" },
      limit: { type: "integer", description: "Max results (default 50, max 200)" },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);
        const tasks = service.listTasks({
          status: params.status as typeof STATUSES[number] | undefined,
          assignee: params.assignee,
          tenant: params.tenant,
          limit: params.limit ?? 50,
        });

        const output = service.formatTaskList(tasks, { truncate: true });

        return {
          content: [{ type: "text" as const, text: output }],
          details: {
            tool: "kanban_list",
            count: tasks.length,
            board: service.board,
            filters: {
              status: params.status || null,
              assignee: params.assignee || null,
              tenant: params.tenant || null,
            },
          },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_list", error: message },
        };
      }
    },
  });
}
