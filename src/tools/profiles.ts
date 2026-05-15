/**
 * kanban_profiles — List available Hermes profiles (agents/workers)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

const execFileAsync = promisify(execFile);

export default function registerProfilesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_profiles",
    description:
      "List all available Hermes profiles (workers/agents) on this system. " +
      "Each profile is an isolated Hermes instance with its own skills, memory, and configuration. " +
      "Use this to discover who you can assign tasks to. " +
      "The kanban assignee field references these profile names.",
    parameters: {
      board: {
        type: "string" as const,
        description: "Board name (defaults to current board)",
      }.optional(),
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);

        // Try hermes profile list first
        try {
          const { stdout } = await execFileAsync("hermes", ["profile", "list", "--json"], {
            timeout: 10000,
          });

          // Parse JSON output
          const profiles = JSON.parse(stdout);
          let output = `**${profiles.length} Hermes profile(s) found**\n\n`;

          for (const profile of profiles) {
            const marker = profile.is_default ? " (default)" : "";
            output += `## ${profile.name}${marker}\n`;
            output += `- Path: ${profile.path}\n`;
            output += `- Model: ${profile.model || "unknown"}\n`;
            output += `- Provider: ${profile.provider || "unknown"}\n`;
            output += `- Skills: ${profile.skill_count || 0}\n`;
            if (profile.gateway_running) {
              output += `- Gateway: running\n`;
            }
            output += "\n";
          }

          output += "Use these profile names as the `assignee` in kanban_create.";

          return {
            content: [{ type: "text" as const, text: output }],
            details: { tool: "kanban_profiles", profiles },
          };
        } catch {
          // Fallback: scan profiles directory directly
          const { readdirSync, existsSync } = await import("node:fs");
          const { join } = await import("node:path");
          const { getHermesHome } = await import("../utils/board-resolve.js");

          const hermesHome = getHermesHome();
          const profiles: string[] = ["default"];

          const profilesDir = join(hermesHome, "profiles");
          if (existsSync(profilesDir)) {
            try {
              const entries = readdirSync(profilesDir, { withFileTypes: true });
              for (const entry of entries) {
                if (entry.isDirectory()) {
                  profiles.push(entry.name);
                }
              }
            } catch {
              // Ignore errors
            }
          }

          let output = `**${profiles.length} Hermes profile(s) found**\n\n`;
          for (const name of profiles) {
            const marker = name === "default" ? " (default)" : "";
            output += `- ${name}${marker}\n`;
          }
          output += "\nUse these profile names as the `assignee` in kanban_create.";

          return {
            content: [{ type: "text" as const, text: output }],
            details: { tool: "kanban_profiles", profiles },
          };
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { tool: "kanban_profiles", error: message },
        };
      }
    },
  });
}
