/**
 * kanban_profiles — List available Hermes profiles (agents/workers)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getService } from "../service/KanbanServiceFactory.js";

const execFileAsync = promisify(execFile);

interface HermesProfile {
  name: string;
  model: string;
  gateway: string;
  alias: string;
  distribution: string;
  is_default: boolean;
}

export default function registerProfilesTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "kanban_profiles",
    description:
      "List all available Hermes profiles (workers/agents) on this system. " +
      "Each profile is an isolated Hermes instance with its own skills, memory, and configuration. " +
      "Use this to discover who you can assign tasks to. " +
      "The kanban assignee field references these profile names.",
    parameters: {
      type: "object",
      properties: {
        board: { type: "string", description: "Board name (defaults to current board)" },
      },
    },
    async execute(_toolCallId, params) {
      try {
        const service = getService(params.board);

        // Try hermes profile list first
        try {
          const { stdout } = await execFileAsync("hermes", ["profile", "list"], {
            timeout: 10000,
          });

          // Parse tabular output
          const profiles = parseHermesProfileList(stdout);
          let output = `**${profiles.length} Hermes profile(s) found**\n\n`;

          for (const profile of profiles) {
            const marker = profile.is_default ? " (default)" : "";
            output += `## ${profile.name}${marker}\n`;
            output += `- Model: ${profile.model || "unknown"}\n`;
            output += `- Gateway: ${profile.gateway || "unknown"}\n`;
            output += `- Alias: ${profile.alias || "—"}\n`;
            output += `- Distribution: ${profile.distribution || "—"}\n`;
            output += "\n";
          }

          output += "Use these profile names as the `assignee` in kanban_create.\n";
          output += "Example: kanban_create(title=\"Task\", assignee=\"researcher\")";

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

/**
 * Parse hermes profile list tabular output
 */
function parseHermesProfileList(output: string): HermesProfile[] {
  const profiles: HermesProfile[] = [];
  const lines = output.split("\n");

  // Skip header lines (first 2 lines are header)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("─") || line.startsWith("Profile")) continue;

    // Parse tabular format: ◆ name   model   gateway   alias   distribution
    // Look for the name at the start (may have ◆ for default)
    const match = line.match(/^◆?\s*(\S+)\s+(.+)$/);
    if (match) {
      const name = match[1];
      const rest = match[2];

      // Split remaining by 2+ spaces
      const parts = rest.split(/\s{2,}/).map((s) => s.trim());

      profiles.push({
        name,
        model: parts[0] || "",
        gateway: parts[1] || "",
        alias: parts[2] || "",
        distribution: parts[3] || "",
        is_default: line.startsWith("◆"),
      });
    }
  }

  return profiles;
}
