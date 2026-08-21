// ============================================================
// UI Helpers — ANSI colors, banner, spinner, tool box, box drawing
// ============================================================

import { Provider, ProviderConfig } from "./types.js";
import * as path from "path";

// --- ANSI Color Codes ---

export const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  inverse: "\x1b[7m",
  hidden: "\x1b[8m",
  // Foreground
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",
  // 24-bit deep blue (#17517e)
  deepBlue: "\x1b[38;2;23;81;126m",
  // Background
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
  bgGray: "\x1b[100m",
};

export function color(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${C.reset}`;
}

// --- Alternate Screen ---

export function enterAltScreen(): void {
  process.stdout.write("\x1b[?1049h");
}

export function exitAltScreen(): void {
  process.stdout.write("\x1b[?1049l");
}

// --- Clear Screen ---

export function clearScreen(): void {
  // Some terminal panes (notably certain embedded/webview terminals) don't
  // fully honor \x1b[2J / \x1b[3J or the alt-screen switch, leaving old
  // lines (like a stray "You › " prompt) visible below newly drawn content.
  // Printing enough blank lines first physically scrolls everything out of
  // the visible viewport — this works regardless of ANSI feature support.
  // NOTE: process.stdout.rows is unreliable in some embedded terminal
  // panes (under-reports the true viewport height), so a fixed generous
  // count is used instead of trusting it — otherwise one clearScreen()
  // call doesn't scroll far enough and stale content lingers until a
  // second render happens to push it the rest of the way out.
  process.stdout.write("\n".repeat(200));
  process.stdout.write("\x1b[2J\x1b[H\x1b[3J");
}

// --- Box Drawing Helpers ---

/** Strip ANSI escape codes to get visible text length */
function visibleLen(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/** Truncate a plain (uncolored) string to fit maxLen, adding an ellipsis if cut */
function clipPlain(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, Math.max(0, maxLen - 1)) + "…";
}

// --- Banner ---

export function printBanner(
  provider: Provider,
  config: ProviderConfig,
  sessionName?: string,
  turns?: number
): void {
  const termWidth = process.stdout.columns || 80;
  const maxAllowed = Math.max(30, termWidth - 2);

  const titleText = "Teddy v1.0 | By Nijushi Digital";
  const providerLine = `provider: ${provider}  |  model: ${config.model}`;
  const sessionLine = sessionName ? `session: ${sessionName}` : "";
  const turnLine = turns !== undefined ? `turns: ${turns}/${MAX_TURNS_DISPLAY}` : "";

  // Width must fit the longest visible content line (+2 for the leading/
  // trailing space each row gets), clamped to the terminal width. This is
  // what was missing before — a fixed 50–55 width caused long session/turn
  // lines to overflow past the right border.
  const contentLens = [
    titleText.length,
    providerLine.length,
    sessionLine.length,
    turnLine.length,
  ];
  const width = Math.max(50, Math.min(maxAllowed, Math.max(...contentLens) + 4));
  const inner = width; // characters between the two border chars

  const row = (text: string, ...codes: string[]): string => {
    const clipped = clipPlain(text, inner - 2);
    const pad = Math.max(0, inner - clipped.length - 2);
    return (
      color("│ ", C.gray) +
      (codes.length ? color(clipped, ...codes) : clipped) +
      " ".repeat(pad) +
      color(" │", C.gray)
    );
  };

  console.log(color("┌" + "─".repeat(inner) + "┐", C.gray));

  // Title, centered
  {
    const clippedTitle = clipPlain(titleText, inner - 2);
    const titlePad = Math.floor((inner - clippedTitle.length) / 2);
    const rightPad = inner - clippedTitle.length - titlePad;
    console.log(
      color("│", C.gray) +
        " ".repeat(titlePad) +
        color("Teddy", C.bold, C.deepBlue) +
        color(" v1.0", C.dim, C.deepBlue) +
        color(" | ", C.dim) +
        color("By Nijushi Digital", C.dim,) +
        " ".repeat(rightPad) +
        color("│", C.gray)
    );
  }

  console.log(color("├" + "─".repeat(inner) + "┤", C.gray));

  console.log(row(providerLine, C.dim));

  if (sessionLine) {
    console.log(row(sessionLine, C.gray));
  }

  if (turnLine) {
    console.log(row(turnLine, C.gray));
  }

  console.log(color("└" + "─".repeat(inner) + "┘", C.gray));
  console.log("");
}

const MAX_TURNS_DISPLAY = 15;

// --- Status Bar ---

export function printStatusBar(): void {
  console.log(
    color("[Ctrl+O : Sessions]", C.dim, C.italic) +
      "  " +
      color("[Ctrl+N : New Session]", C.dim, C.italic) +
      "  " +
      color("[Ctrl+H : Help]", C.dim, C.italic) +
      "  " +
      color("[Ctrl+L : Clear]", C.dim, C.italic) +
      "  " +
      color("[Ctrl+E : Exit]", C.dim, C.italic) +
      "\n"
  );
}

// --- Messages ---

export function printUser(text: string): void {
  console.log(color("You", C.bold, C.deepBlue) + color(" › ", C.gray) + text);
}

export function printAssistant(text: string): void {
  if (!text) return;
  const PREFIX =
    "\n" +
    color("● ", C.green) +
    color("Agent", C.bold, C.green) +
    color(` | (${process.env.MODEL || "default"})`, C.dim) +
    "\n";
  process.stdout.write(PREFIX);
  const segments = parseCodeBlocks(text);
  for (const seg of segments) {
    if (seg.type === "text") {
      console.log(seg.content);
    } else {
      printCodeBlock(seg.content, seg.language);
      lastCodeBlock = seg.content;
    }
  }
}

// --- Code Block Rendering ---

type TextSegment =
  | { type: "text"; content: string }
  | { type: "code"; language: string; content: string };

let lastCodeBlock = "";

export function getLastCodeBlock(): string {
  return lastCodeBlock;
}

function parseCodeBlocks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) {
      const before = text.slice(lastIdx, m.index).trim();
      if (before) segments.push({ type: "text", content: before });
    }
    segments.push({ type: "code", language: m[1] || "", content: m[2].trim() });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    const after = text.slice(lastIdx).trim();
    if (after) segments.push({ type: "text", content: after });
  }
  return segments;
}
// --- Syntax Highlighting ---

const LANG_ALIAS: Record<string, string> = {
  js: "js", javascript: "js", ts: "ts", typescript: "ts", tsx: "ts", jsx: "js",
  py: "py", python: "py",
  sh: "sh", bash: "sh", shell: "sh", zsh: "sh",
  json: "json", html: "html", xml: "html", css: "css",
  sql: "sql", yaml: "yaml", yml: "yaml",
};

const KEYWORDS: Record<string, string[]> = {
  js: "const let var function if else return import export from class async await try catch throw new this for while do switch case break continue default typeof instanceof extends implements interface type enum null undefined true false of in".split(" "),
  ts: "const let var function if else return import export from class async await try catch throw new this for while do switch case break continue default typeof instanceof extends implements interface type enum null undefined true false of in".split(" "),
  py: "def class if elif else return import from as try except finally raise with for while break continue pass yield lambda and or not in is None True False self".split(" "),
  sh: "if then else elif fi for while do done case esac function return local export echo exit source alias set unset".split(" "),
  sql: "SELECT FROM WHERE INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER ADD DROP INDEX VIEW JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT OFFSET UNION ALL AS AND OR NOT NULL IS IN BETWEEN LIKE EXISTS CASE WHEN THEN ELSE END DISTINCT COUNT SUM AVG MAX MIN PRIMARY KEY FOREIGN REFERENCES".split(" "),
  json: [],
  html: [],
  css: [],
  yaml: [],
};

function highlightCode(code: string, language: string): string[] {
  const lang = LANG_ALIAS[language.toLowerCase()] || "";
  const kw = KEYWORDS[lang] || [];
  const kwSet = new Set(kw);
  const lines = code.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    let colored = "";
    let i = 0;

    while (i < line.length) {
      // Single-line comment
      if ((lang === "js" || lang === "ts" || lang === "css") && line[i] === "/" && line[i + 1] === "/") {
        colored += color(line.slice(i), C.dim, C.italic);
        break;
      }
      if ((lang === "py" || lang === "sh" || lang === "yaml") && line[i] === "#") {
        colored += color(line.slice(i), C.dim, C.italic);
        break;
      }
      if (lang === "sql" && line[i] === "-" && line[i + 1] === "-") {
        colored += color(line.slice(i), C.dim, C.italic);
        break;
      }

      // String
      if (line[i] === `"` || line[i] === `'` || line[i] === "`") {
        const quote = line[i];
        let j = i + 1;
        while (j < line.length) {
          if (line[j] === "\\") { j += 2; continue; }
          if (line[j] === quote) { j++; break; }
          j++;
        }
        colored += color(line.slice(i, j), C.green);
        i = j;
        continue;
      }

      // Number
      if (/\d/.test(line[i]) && (i === 0 || /\s|[({[,;+\-*/=<>!?:&|]/.test(line[i - 1]))) {
        let j = i;
        while (j < line.length && /[\d.xabcdefABCDEF_]/.test(line[j])) j++;
        if (j > i) {
          colored += color(line.slice(i, j), C.yellow);
          i = j;
          continue;
        }
      }

      // Word (potential keyword or function call)
      if (/[a-zA-Z_]/.test(line[i])) {
        let j = i;
        while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
        const word = line.slice(i, j);
        if (kwSet.has(word)) {
          colored += color(word, C.brightBlue);
        } else if (j < line.length && line[j] === "(") {
          colored += color(word, C.brightMagenta);
        } else {
          colored += word;
        }
        i = j;
        continue;
      }

      colored += line[i];
      i++;
    }

    result.push(colored);
  }

  return result;
}

function printCodeBlock(code: string, language: string): void {
  const highlighted = highlightCode(code, language);
  const PLAIN = highlighted.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
  const maxContentLen = Math.max(...PLAIN.map((l) => l.length), 20);
  const termWidth = process.stdout.columns || 80;
  // width = content + padding (4), capped at terminal width - 2, min 40
  const width = Math.max(40, Math.min(maxContentLen + 4, termWidth - 2));
  const inner = width - 2;

  // Top border: ┌── 📋 LANG ───...──┐
  const langLabel = language ? language.toUpperCase() : "CODE";
  const titlePart = `\u{1F4CB} ${langLabel}`;
  const titleLen = visibleLen(titlePart);
  const dashes = Math.max(0, width - 6 - titleLen);
  console.log(
    color("\u250C\u2500\u2500 ", C.white) +
    color(titlePart, C.dim, C.italic) +
    color(" " + "\u2500".repeat(dashes) + "\u2510", C.white)
  );

  for (let i = 0; i < highlighted.length; i++) {
    const raw = PLAIN[i];
    const colored = highlighted[i];
    const pad = Math.max(0, inner - raw.length - 1);
    console.log(
      color("\u2502", C.white) +
        " " +
        colored +
        " ".repeat(pad) +
        color("\u2502", C.white)
    );
  }

  console.log(
    color("\u2514" + "\u2500".repeat(inner) + "\u2518", C.white)
  );
}

// --- Tool Call / Result (animated box) ---

const TOOL_META: Record<string, { icon: string; verbIng: string; verbPast: string }> = {
  read_file: { icon: "📄", verbIng: "Reading", verbPast: "Read" },
  write_file: { icon: "✏️", verbIng: "Writing", verbPast: "Written" },
};

export function printToolCall(name: string, input: any): (output?: string) => void {
  // run_command — console-style box
  if (name === "run_command") {
    const cmd = String(input.command ?? "");
    const boxWidth = Math.min(200, (process.stdout.columns || 80) - 2);
    const innerW = boxWidth - 2;

    const topBorder = color("┌" + "─".repeat(innerW) + "┐", C.yellow);
    const botBorder = color("└" + "─".repeat(innerW) + "┘", C.yellow);
    const sepBorder = color("├" + "─".repeat(innerW) + "┤", C.yellow);

    // Strip ANSI escapes / control chars (incl. \r) so width math stays exact
    const clean = (s: string): string =>
      s
        .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "")
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
        .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
        .replace(/\t/g, "    ")
        .trimEnd();
    const clip = (s: string, max: number): string =>
      s.length > max ? s.slice(0, Math.max(0, max - 1)) + "…" : s;
    // One padded row: "│ " + content + pad + "│" — always exactly boxWidth cols
    const row = (content: string, ...codes: string[]): string => {
      const padded =
        " " + content + " ".repeat(Math.max(0, innerW - 1 - content.length));
      return (
        color("│", C.yellow) +
        (codes.length ? color(padded, ...codes) : padded) +
        color("│", C.yellow)
      );
    };

    console.log("");
    console.log(topBorder);
    console.log(row(clip(clean("> " + cmd), innerW - 1), C.white, C.bgBlack));

    return (output?: string) => {
      console.log(sepBorder);
      const lines = (output ?? "")
        .replace(/\r/g, "")
        .split("\n")
        .map(clean);
      while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

      if (lines.length === 0) {
        console.log(row("(no output)", C.dim));
      } else {
        for (const line of lines.slice(0, 20)) {
          console.log(row(clip(line, innerW - 1)));
        }
        if (lines.length > 20) {
          console.log(row(`…(${lines.length - 20} more lines)`, C.dim));
        }
      }
      console.log(botBorder);
    };
  }

  const meta = TOOL_META[name] || { icon: "⚙", verbIng: "Running", verbPast: "Ran" };
  const fileName = input.path ? path.basename(input.path) : "";
  const boxWidth = Math.max(40, Math.min(52, (process.stdout.columns || 80) - 2));
  const innerW = boxWidth - 2;
  const label = `${meta.icon} ${meta.verbIng} "${fileName}"`;
  const maxLabel = innerW - 4;

  const top = color("┌" + "─".repeat(innerW) + "┐", C.gray);
  const bot = color("└" + "─".repeat(innerW) + "┘", C.gray);

  console.log("");
  console.log(top);
  process.stdout.write(
    color("│", C.gray) +
      color(" ", C.bgBlack) +
      color(label, C.white, C.bgBlack)
  );
  const padLen = Math.max(0, innerW - label.length - 1);
  process.stdout.write(color(" ".repeat(padLen), C.bgBlack));
  process.stdout.write(color("│", C.gray));

  let dots = 0;
  let stopped = false;
  const interval = setInterval(() => {
    if (stopped) return;
    dots = (dots % 3) + 1;
    const dotStr = ".".repeat(dots);
    const display = label + dotStr;
    const clipped =
      display.length > maxLabel ? display.slice(0, maxLabel) : display;
    const cPad = Math.max(0, innerW - clipped.length - 1);
    process.stdout.write("\r\x1b[K");
    process.stdout.write(
      color("│", C.gray) +
        color(" " + clipped, C.white, C.bgBlack) +
        color(" ".repeat(cPad), C.bgBlack) +
        color("│", C.gray)
    );
  }, 250);

  return () => {
    stopped = true;
    clearInterval(interval);
    const doneLabel = `${meta.icon} ${meta.verbPast} "${fileName}"`;
    const clipped =
      doneLabel.length > maxLabel ? doneLabel.slice(0, maxLabel) : doneLabel;
    const cPad = Math.max(0, innerW - clipped.length - 1);
    process.stdout.write("\r\x1b[K");
    process.stdout.write(
      color("│", C.gray) +
        color(" " + clipped, C.white, C.bgBlack) +
        color(" ".repeat(cPad), C.bgBlack) +
        color("│", C.gray)
    );
    console.log("\n" + bot);
  };
}

export function printToolResult(output: string): void {
  const lines = output.split("\n").slice(0, 6);
  const preview = lines.join("\n").slice(0, 400);
  const truncated =
    output.length > preview.length
      ? "\n" + color("  …(truncated)", C.gray)
      : "";
  console.log(
    color("  ↳ ", C.gray) +
      preview
        .split("\n")
        .map((l, i) => (i === 0 ? l : "    " + l))
        .join("\n") +
      truncated
  );
}

export function printError(text: string): void {
  console.log(color("✖ ", C.red) + color(text, C.red));
}

export function printWarning(text: string): void {
  console.log(color("⚠ ", C.yellow) + color(text, C.yellow));
}

export function printInfo(text: string): void {
  console.log(color(text, C.gray));
}
// --- Help ---

export function printHelp(): void {
  console.log("");
  console.log(color("┌─── Commands ───────────────────────────────────────┐", C.gray));
  console.log(
    color("│", C.gray) +
      color("  Ctrl+H     ", C.bold, C.cyan) +
      color("Show help list", C.dim) +
      color("                         │", C.gray)
  );
  console.log(
    color("│", C.gray) +
      color("  Ctrl+E     ", C.bold, C.cyan) +
      color("Exit Teddy", C.dim) +
      color("                           │", C.gray)
  );
  console.log(
    color("│", C.gray) +
      color("  Ctrl+L     ", C.bold, C.cyan) +
      color("Reset/clear chat history", C.dim) +
      color("               │", C.gray)
  );
  console.log(
    color("│", C.gray) +
      color("  Ctrl+O     ", C.bold, C.cyan) +
      color("Open chat session(s) history", C.dim) +
      color("           │", C.gray)
  );
  console.log(
    color("│", C.gray) +
      color("  :new       ", C.bold, C.cyan) +
      color("Save session & start new session", C.dim) +
      color("       │", C.gray)
  );
  console.log(
    color("│", C.gray) +
      color("  :sessions  ", C.bold, C.cyan) +
      color("Open chat session(s) history", C.dim) +
      color("           │", C.gray)
  );
  console.log(
    color("│", C.gray) +
      color("  Ctrl+N     ", C.bold, C.cyan) +
      color("New session", C.dim) +
      color("                              │", C.gray)
  );
  console.log(
    color("│", C.gray) +
      color("  Ctrl+V     ", C.bold, C.cyan) +
      color("Paste from clipboard", C.dim) +
      color("                   │", C.gray)
  );
  console.log(
    color("│", C.gray) +
      color("  ↑↓         ", C.bold, C.cyan) +
      color("Navigate input history", C.dim) +
      color("                 │", C.gray)
  );
  console.log(color("└────────────────────────────────────────────────────┘", C.gray));
  console.log("");
}

// --- Generic Box Drawing (used by session picker etc.) ---

export function drawBox(
  title: string,
  lines: string[],
  options?: {
    selected?: number;
    footer?: string;
    width?: number;
    verticalCenter?: boolean;
  }
): void {
  // Width must fit the longest visible line (title, content, footer) — not
  // just a fixed default — otherwise long lines overflow past the border.
  const longestContent = Math.max(0, ...lines.map((l) => visibleLen(l)));
  const footerLen = options?.footer ? visibleLen(options.footer) : 0;
  const titleStr = ` ${title} `;
  const neededInner = Math.max(titleStr.length, longestContent + 2, footerLen + 2);
  const width =
    options?.width ||
    Math.max(40, Math.min(neededInner + 2, (process.stdout.columns || 80) - 2));
  const innerWidth = width - 2;
  const verticalCenter = options?.verticalCenter !== false; // default to true

  const titlePad = Math.floor((innerWidth - titleStr.length) / 2);
  const titleRightPad = innerWidth - titlePad - titleStr.length;
  console.log(
    color("┌" + "─".repeat(Math.max(0, titlePad)), C.gray) +
      color(titleStr, C.bold, C.cyan) +
      color("─".repeat(Math.max(0, titleRightPad)) + "┐", C.gray)
  );

  // Calculate vertical padding for centering
  const contentLines = lines.length;
  const footerLines = options?.footer ? 2 : 0; // separator + footer
  const totalContentLines = contentLines + footerLines;
  const termHeight = process.stdout.rows || 24;
  // Use a reasonable max height for the box (leave room for title, borders, prompt)
  const maxBoxHeight = Math.min(termHeight - 4, 20);
  const availableLines = maxBoxHeight - 2; // minus top and bottom borders
  const topPadding = verticalCenter && totalContentLines < availableLines
    ? Math.floor((availableLines - totalContentLines) / 2)
    : 0;

  // Print top padding (empty lines)
  for (let i = 0; i < topPadding; i++) {
    console.log(color("│", C.gray) + " ".repeat(innerWidth) + color("│", C.gray));
  }

  for (let i = 0; i < lines.length; i++) {
    const isSelected = options?.selected === i;
    const raw = lines[i];
    const vlen = visibleLen(raw);
    const pad = Math.max(0, innerWidth - vlen - 1);

    if (isSelected) {
      console.log(
        color("│", C.gray) +
          color(" " + raw + " ".repeat(pad), C.inverse, C.cyan) +
          color("│", C.gray)
      );
    } else {
      console.log(
        color("│", C.gray) +
          " " +
          raw +
          " ".repeat(pad) +
          color("│", C.gray)
      );
    }
  }

  if (options?.footer) {
    console.log(color("├" + "─".repeat(innerWidth) + "┤", C.gray));
    const footerVlen = visibleLen(options.footer);
    const footerPad = Math.max(0, innerWidth - footerVlen - 1);
    console.log(
      color("│", C.gray) +
        color(" " + options.footer + " ".repeat(footerPad), C.dim) +
        color("│", C.gray)
    );
  }

  console.log(color("└" + "─".repeat(innerWidth) + "┘", C.gray));
}

// --- Exit Confirmation ---

export function printExitConfirm(sessionName: string): void {
  console.log("");
  console.log(
    color("  Session ", C.gray) +
      color(sessionName, C.bold, C.cyan) +
      color(" saved.", C.gray)
  );
  console.log(color("  Goodbye 👋\n", C.gray));
}

export function printSuccess(text: string): void {
  console.log(color("✔ ", C.green) + color(text, C.green));
}

// --- Spinner ---

export function startSpinner(label: string): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  process.stdout.write("\n");
  const interval = setInterval(() => {
    process.stdout.write(
      `\r${color(frames[i], C.cyan)} ${color(label, C.gray)}  `
    );
    i = (i + 1) % frames.length;
  }, 80);
  return () => {
    clearInterval(interval);
    process.stdout.write("\r" + " ".repeat(label.length + 4) + "\r");
  };
}