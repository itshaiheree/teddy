// ============================================================
// Tools — Definitions & execution (zero dependencies)
// ============================================================

import * as fs from "fs";
import { spawnSync } from "child_process";
import { ToolDef } from "./types.js";

// --- Tool Definitions ---

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "read_file",
    description: "Reads the contents of a file from disk.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path to the file to read" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Writes (creates/overwrites) a file on disk.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Target file path" },
        content: {
          type: "string",
          description: "File content to write",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "run_command",
    description: "Runs a shell command and returns its output.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "Shell command to execute",
        },
      },
      required: ["command"],
    },
  },
];

// --- Tool Execution ---

export function executeTool(name: string, input: any): string {
  try {
    switch (name) {
      case "read_file":
        return fs.readFileSync(input.path, "utf-8");
      case "write_file":
        fs.writeFileSync(input.path, input.content, "utf-8");
        return `File written to ${input.path}`;
      case "run_command": {
        // Capture stdout AND stderr (piped) — nothing prints directly to the
        // terminal, so the UI box can render all output inside its borders.
        const result = spawnSync(input.command, {
          shell: true,
          encoding: "utf-8",
          timeout: 30_000,
          maxBuffer: 10 * 1024 * 1024,
          windowsHide: true,
        });
        const stdout = result.stdout ?? "";
        const stderr = result.stderr ?? "";
        let out = stdout;
        if (stderr.trim()) {
          out += (out && !out.endsWith("\n") ? "\n" : "") + stderr;
        }
        out = out.trimEnd();
        if (result.error) {
          return out
            ? `${out}\nError: ${result.error.message}`
            : `Error: ${result.error.message}`;
        }
        if (result.status !== 0 && result.status !== null) {
          return out
            ? `${out}\n(exit code ${result.status})`
            : `(exit code ${result.status})`;
        }
        return out;
      }
      default:
        return `Error: unknown tool "${name}"`;
    }
  } catch (err: any) {
    return `Error executing tool ${name}: ${err.message}`;
  }
}