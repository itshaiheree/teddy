// ============================================================
// Session Picker — TUI for selecting/loading sessions (Ctrl+O)
// ============================================================

import { listSessions, loadSession, deleteSession, formatSessionMeta } from "./session.js";
import { Session, SessionMeta } from "./types.js";
import { C, color, clearScreen, drawBox, enterAltScreen, exitAltScreen } from "./ui.js";
import { pauseInput, resumeInput } from "./input-handler.js";

// --- Types ---

export type PickerResult =
  | { action: "select"; session: Session }
  | { action: "new" }
  | { action: "cancel" };

// --- Session Picker ---

export async function showSessionPicker(): Promise<PickerResult> {
  const sessions = listSessions();
  let selectedIndex = 0;
  let resolved = false;

  function buildLines(): string[] {
    const lines: string[] = [];

    if (sessions.length === 0) {
      lines.push("  (no saved sessions yet)");
      lines.push(color("  +  New Session", C.green));
    } else {
      for (const s of sessions) {
        const meta = formatSessionMeta(s);
        lines.push(`  ${meta}`);
      }
      lines.push(color("  +  New Session", C.green));
    }

    return lines;
  }

  return new Promise<PickerResult>((resolve) => {
    // Pause the main REPL input handler
    pauseInput();

    // Switch to the alternate screen buffer — a genuinely blank canvas,
    // isolated from whatever prompt text/scrollback was on screen before.
    // This is the reliable fix for leftover "You › " text leaking into the
    // picker: clearScreen()'s ANSI codes alone aren't consistently honored
    // by every terminal (notably VS Code's integrated terminal).
    enterAltScreen();

    const totalItems = Math.max(1, sessions.length + 1);

    function render() {
      clearScreen();
      const lines = buildLines();
      drawBox("Sessions", lines, {
        selected: selectedIndex,
        // No fixed `width` here — let drawBox size itself to the longest
        // line (session dates, turn counts, model, first message). A fixed
        // width caused long session rows to overflow past the right border.
        footer: "\u2191\u2193 navigate  \u21B5 select  Esc cancel  D delete  N new",
        // Off — vertical centering was adding empty padding lines above the
        // list, pushing it down with a big blank gap at the top.
        verticalCenter: false,
      });
    }

    function cleanup() {
      process.stdin.removeListener("data", pickerHandler);
      exitAltScreen();
      resumeInput();
    }

    function doSelect() {
      if (sessions.length === 0 || selectedIndex >= sessions.length) {
        cleanup();
        resolved = true;
        resolve({ action: "new" });
        return;
      }

      const session = loadSession(sessions[selectedIndex].id);
      cleanup();
      resolved = true;
      if (session) {
        resolve({ action: "select", session });
      } else {
        resolve({ action: "new" });
      }
    }

    function doDelete() {
      if (sessions.length === 0) return;
      if (selectedIndex >= sessions.length) return;

      const meta = sessions[selectedIndex];
      deleteSession(meta.id);
      sessions.splice(selectedIndex, 1);
      if (selectedIndex >= sessions.length + 1) {
        selectedIndex = Math.max(0, sessions.length);
      }
      render();
    }

    function pickerHandler(data: Buffer) {
      if (resolved) return;

      const str = data.toString();

      if (str === "\x1b[A") {
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
      } else if (str === "\x1b[B") {
        selectedIndex = Math.min(totalItems - 1, selectedIndex + 1);
        render();
      } else if (str === "\r" || str === "\n") {
        doSelect();
      } else if (str === "\x1b") {
        cleanup();
        resolved = true;
        resolve({ action: "cancel" });
      } else if (str === "d" || str === "D") {
        doDelete();
      } else if (str === "n" || str === "N") {
        cleanup();
        resolved = true;
        resolve({ action: "new" });
      } else if (str === "\x03") {
        cleanup();
        resolved = true;
        resolve({ action: "cancel" });
      }
    }

    process.stdin.on("data", pickerHandler);
    render();
    render();
  });
}