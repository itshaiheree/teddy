// ============================================================
// Raw Input Handler — line reader with Ctrl+key shortcuts
// ============================================================

import { KeyEvent } from "./types.js";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

// --- Persistent history file ---

const HISTORY_DIR = join(homedir(), ".umigent");
const HISTORY_FILE = join(HISTORY_DIR, "history");
const MAX_HISTORY = 500;

function loadHistory(): string[] {
  try {
    if (!existsSync(HISTORY_FILE)) return [];
    const raw = readFileSync(HISTORY_FILE, "utf-8");
    return raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveHistory(hist: string[]): void {
  try {
    if (!existsSync(HISTORY_DIR)) mkdirSync(HISTORY_DIR, { recursive: true });
    const trimmed = hist.slice(-MAX_HISTORY);
    writeFileSync(HISTORY_FILE, trimmed.join("\n") + "\n", "utf-8");
  } catch {
    // best-effort — never crash the app over history persistence
  }
}

// --- State ---

let rawModeWasEnabled = false;
let inputBuffer = "";
let cursorPos = 0;
let history: string[] = loadHistory();
let historyIndex = -1;
let currentLine = "";
let lineResolve: ((value: string) => void) | null = null;
let keyCallback: ((event: KeyEvent) => void) | null = null;
let promptText = "";
let paused = false;

// --- Escape sequence detection ---

function parseEscape(data: Buffer): KeyEvent | null {
  const str = data.toString();

  // Arrow keys (ANSI: \x1b[A, SS3: \x1bOA)
  if (str === "\x1b[A" || str === "\x1bOA") return { type: "up" };
  if (str === "\x1b[B" || str === "\x1bOB") return { type: "down" };
  if (str === "\x1b[C" || str === "\x1bOC") return { type: "right" };
  if (str === "\x1b[D" || str === "\x1bOD") return { type: "left" };

  // CSI sequences: Ctrl+Shift+Alt+C (kitty protocol: \x1b[99;7u or \x1b[99;8u)
  if (str === "\x1b[99;7u" || str === "\x1b[99;8u") return { type: "ctrl_c" };

  // Tab
  if (str === "\t") return { type: "tab" };

  return null;
}

// --- Handle a key event (arrow keys, tab, etc.) ---

function handleKeyEvent(event: KeyEvent): void {
  switch (event.type) {
    case "up":
      if (history.length > 0) {
        if (historyIndex === -1) {
          currentLine = inputBuffer;
          historyIndex = history.length - 1;
        } else if (historyIndex > 0) {
          historyIndex--;
        }
        inputBuffer = history[historyIndex];
        cursorPos = inputBuffer.length;
        refreshLine();
      }
      break;
    case "down":
      if (historyIndex >= 0) {
        historyIndex++;
        if (historyIndex >= history.length) {
          historyIndex = -1;
          inputBuffer = currentLine;
        } else {
          inputBuffer = history[historyIndex];
        }
        cursorPos = inputBuffer.length;
        refreshLine();
      }
      break;
    case "left":
      if (cursorPos > 0) { cursorPos--; refreshLine(); }
      break;
    case "right":
      if (cursorPos < inputBuffer.length) { cursorPos++; refreshLine(); }
      break;
    default:
      if (keyCallback) keyCallback(event);
  }
}

// --- Refresh the current line on screen ---

function refreshLine() {
  process.stdout.write("\r\x1b[K");
  process.stdout.write(promptText + inputBuffer);
  if (cursorPos < inputBuffer.length) {
    process.stdout.write(`\x1b[${inputBuffer.length - cursorPos}D`);
  }
}

// --- Read clipboard (cross-platform, uses spawnSync for reliability) ---

function readClipboard(): string {
  try {
    const opts = { encoding: "utf-8" as const, timeout: 3000, maxBuffer: 1024 * 1024 };
    if (process.platform === "win32") {
      const r = spawnSync("powershell", ["-NoProfile", "-Command", "Get-Clipboard"], opts);
      if (r.status === 0 && r.stdout) return r.stdout.replace(/\r\n/g, "\n").trim();
    } else if (process.platform === "darwin") {
      const r = spawnSync("pbpaste", [], opts);
      if (r.status === 0 && r.stdout) return r.stdout.trim();
    } else {
      // Try xclip first, then wl-paste
      const r = spawnSync("xclip", ["-selection", "clipboard", "-o"], { ...opts, timeout: 2000 });
      if (r.status === 0 && r.stdout) return r.stdout.trim();
      const r2 = spawnSync("wl-paste", [], { ...opts, timeout: 2000 });
      if (r2.status === 0 && r2.stdout) return r2.stdout.trim();
    }
  } catch {
    // silently fail
  }
  return "";
}

// --- Handle Enter / submit ---

function submitLine() {
  process.stdout.write("\n");
  const line = inputBuffer;
  const trimmed = line.trim();
  if (trimmed && (history.length === 0 || history[history.length - 1] !== trimmed)) {
    history.push(trimmed);
    saveHistory(history);
  }
  historyIndex = -1;
  inputBuffer = "";
  cursorPos = 0;
  if (lineResolve) {
    const resolve = lineResolve;
    lineResolve = null;
    resolve(line);
  }
}

// --- Handle one or more characters arriving in a single data event ---
// (Direct terminal paste delivers the whole pasted text as ONE multi-char
// string here, not as separate keystrokes — so this must loop over it
// instead of only handling str.length === 1.)

function handleChar(str: string) {
  let i = 0;
  while (i < str.length) {
    const ch = str[i];
    const code = str.charCodeAt(i);

    if (ch === "\r" || ch === "\n") {
      const isPastedChunk = str.length > 1;
      if (isPastedChunk) {
        // part of a multi-line paste: insert a space instead of submitting
        inputBuffer = inputBuffer.slice(0, cursorPos) + " " + inputBuffer.slice(cursorPos);
        cursorPos++;
        if (ch === "\r" && str[i + 1] === "\n") i++;
        i++;
        continue;
      } else {
        submitLine();
        return;
      }
    }

    if (ch === "\x7f") {
      if (cursorPos > 0) {
        inputBuffer = inputBuffer.slice(0, cursorPos - 1) + inputBuffer.slice(cursorPos);
        cursorPos--;
      }
      i++;
      continue;
    }

    if (ch === "\x08") { if (keyCallback) keyCallback({ type: "ctrl_h" }); i++; continue; }
    if (ch === "\x0f") { if (keyCallback) keyCallback({ type: "ctrl_o" }); i++; continue; }
    if (ch === "\x04") { if (keyCallback) keyCallback({ type: "ctrl_d" }); i++; continue; }
    if (ch === "\x0e") { if (keyCallback) keyCallback({ type: "ctrl_n" }); i++; continue; }
    if (ch === "\x05") { if (keyCallback) keyCallback({ type: "ctrl_e" }); i++; continue; }

    if (ch === "\x0c") {
      if (keyCallback) keyCallback({ type: "ctrl_c" });
      if (lineResolve) {
        process.stdout.write("\n");
        const resolve = lineResolve;
        lineResolve = null;
        inputBuffer = "";
        cursorPos = 0;
        resolve("");
      }
      i++;
      continue;
    }

    if (ch === "\x16") {
      const text = readClipboard();
      if (text) {
        const sanitized = text.replace(/\r?\n/g, " ");
        inputBuffer = inputBuffer.slice(0, cursorPos) + sanitized + inputBuffer.slice(cursorPos);
        cursorPos += sanitized.length;
      }
      i++;
      continue;
    }

    if (code >= 32) {
      inputBuffer = inputBuffer.slice(0, cursorPos) + ch + inputBuffer.slice(cursorPos);
      cursorPos++;
      i++;
      continue;
    }

    i++; // unknown control char, skip
  }

  refreshLine();
}

// --- Data handler ---

let escapeBuffer = "";

function onData(data: Buffer) {
  if (paused) return;

  const str = data.toString();

  // Accumulate escape sequences (may arrive in pieces)
  if (escapeBuffer || str.startsWith("\x1b")) {
    escapeBuffer += str;

    const keyEvent = parseEscape(Buffer.from(escapeBuffer));
    if (keyEvent) {
      escapeBuffer = "";
      handleKeyEvent(keyEvent);
      return;
    }

    // If escape buffer is not an escape sequence start, flush as regular chars
    if (!escapeBuffer.startsWith("\x1b")) {
      handleChar(escapeBuffer);
      escapeBuffer = "";
      return;
    }

    // Max escape sequence length — flush if we exceed it
    if (escapeBuffer.length >= 12) {
      handleChar(escapeBuffer);
      escapeBuffer = "";
    }
    return;
  }

  handleChar(str);
}

// --- Public API ---

export function setupRawInput(): void {
  rawModeWasEnabled = process.stdin.isRaw || false;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", onData);
  escapeBuffer = "";
  paused = false;
}

export function restoreInput(): void {
  process.stdin.setRawMode(rawModeWasEnabled);
  process.stdin.removeListener("data", onData);
  if (!rawModeWasEnabled) process.stdin.pause();
}

export function pauseInput(): void {
  paused = true;
}

export function resumeInput(): void {
  paused = false;
  escapeBuffer = "";
}

export function onKey(callback: (event: KeyEvent) => void): void {
  keyCallback = callback;
}

export function readLine(prompt: string): Promise<string> {
  promptText = prompt;
  process.stdout.write(prompt);
  return new Promise<string>((resolve) => {
    lineResolve = resolve;
  });
}

export function clearInputBuffer(): void {
  inputBuffer = "";
  cursorPos = 0;
}