// ============================================================
// Tools — Definitions & execution (zero dependencies)
// ============================================================

import * as fs from "fs";
import { spawnSync } from "child_process";
import { ToolDef } from "./types.js";
import {
  color,
  C,
  drawBox,
  printWarning,
} from "./ui.js";
import { pauseInput, resumeInput } from "./input-handler.js";

// --- Config for run_command consent (in-memory, per-conversation) ---
//
// "Always allow" is intentionally kept in memory and scoped to the current
// conversation/session. agent.ts calls resetRunCommandConsent() whenever a
// new conversation starts (:new, :clear, :sessions load, runOnce, REPL start),
// so approval state never leaks across restarts or unrelated sessions.

let runCommandAlwaysAllow = false;

export function resetRunCommandConsent(): void {
  runCommandAlwaysAllow = false;
}

// --- Consent Prompt ---

type ConsentChoice = "allow" | "deny" | "always" | "deny_ntty";

// How long (ms) to wait for a consent keypress before auto-denying. This is a
// last-resort guard so the prompt can never hang the process forever, even if
// stdin stops delivering input in some odd terminal state.
const CONSENT_TIMEOUT_MS = 120_000;

async function promptForConsent(command: string): Promise<ConsentChoice> {
  if (runCommandAlwaysAllow) {
    return "allow";
  }

  const stdin = process.stdin;
  const isTTY = stdin.isTTY;

  // No interactive terminal → there is no way to read an a/d/s keypress.
  // Return a denial *immediately* instead of attaching a 'data' listener that
  // never fires. On a closed/piped stdin the old code waited on that listener
  // forever; with nothing else pending, the Node event loop emptied out and
  // the process quit silently (exit code 0, no output) right here — the bug
  // this guard fixes.
  if (!isTTY) {
    drawBox(" ⚠ Command Execution Blocked ", [
      color("The agent wants to run a shell command:", C.yellow),
      "",
      color(`  ${command}`, C.cyan),
      "",
      color("Blocked: no interactive terminal (TTY) to approve it.", C.red),
      color("Re-run Teddy in an interactive terminal to allow shell commands.", C.dim),
    ]);
    return "deny_ntty";
  }

  // Use the existing drawBox function for a nice UI
  const lines = [
    color("The agent wants to run a shell command:", C.yellow),
    "",
    color(`  ${command}`, C.cyan),
    "",
    color("Do you allow this?", C.white),
  ];

  drawBox(" ⚠ Command Execution Consent ", lines, {
    footer: color("  [A] Allow   [D] Deny   [S] Always Allow", C.dim),
  });

  // Read a single keypress without Enter. Note: we deliberately do NOT call
  // stdin.setEncoding("utf-8") here — that permanently changes the encoding of
  // the shared stdin stream and makes the main REPL input handler start
  // receiving strings instead of Buffers. We read the raw Buffer and convert
  // it ourselves instead, so the REPL handler's expectations stay intact.
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => finish("deny"), CONSENT_TIMEOUT_MS);

    function finish(choice: ConsentChoice) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(choice);
    }

    function onData(key: Buffer | string) {
      const k = key.toString().toLowerCase();
      if (k === "a") {
        finish("allow");
      } else if (k === "d") {
        finish("deny");
      } else if (k === "s") {
        finish("always");
      }
      // Ignore other keys
    }

    function cleanup() {
      // Hand input back to the main REPL handler so the a/d/s keypresses
      // don't leak into the user's next prompt buffer.
      resumeInput();
      // The REPL runs in raw mode with a *flowing* stdin. Restore exactly
      // that state. Do NOT call stdin.pause(): pausing drops the open stdin
      // handle that keeps the Node event loop alive, so with nothing else
      // pending the process would exit right after this task finishes.
      stdin.setRawMode(true);
      stdin.resume();
      stdin.off("data", onData);
    }

    // Pause the main REPL input handler while we wait for the user's choice.
    pauseInput();
    stdin.on("data", onData);
  });
}

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

export async function executeTool(name: string, input: any): Promise<string> {
  try {
    switch (name) {
      case "read_file":
        return fs.readFileSync(input.path, "utf-8");
      case "write_file":
        fs.writeFileSync(input.path, input.content, "utf-8");
        return `File written to ${input.path}`;
      case "run_command": {
        // Check consent before running
        const consent = await promptForConsent(input.command);

        if (consent === "deny") {
          return "Command execution denied by user.";
        }

        if (consent === "deny_ntty") {
          return "Command execution blocked: no interactive terminal (TTY) available to approve it. Re-run Teddy in an interactive terminal to allow shell commands.";
        }

        if (consent === "always") {
          runCommandAlwaysAllow = true;
          printWarning("  'Always allow' enabled for this conversation — future commands run without prompt.");
          printWarning("  To require approval again, start a new conversation (:new / :clear).");
        }

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