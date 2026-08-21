/**
 * Coding Agent — TypeScript, TANPA SDK (pakai fetch native saja).
 * Support 2 jenis API:
 *   - "anthropic"      -> format /v1/messages (Anthropic, atau provider lain yang kompatibel)
 *   - "openai"         -> format /v1/chat/completions (OpenAI, atau provider lain yang kompatibel:
 *                          contoh: Groq, OpenRouter, Ollama, DeepSeek, dll)
 *
 * Tidak butuh `npm install @anthropic-ai/sdk` atau `openai` — cuma pakai fetch bawaan Node 18+.
 *
 * Jalankan:
 *   PROVIDER=anthropic ANTHROPIC_API_KEY=xxx npx ts-node agent.ts "Buat file hello.js lalu jalankan"
 *   PROVIDER=openai OPENAI_API_KEY=xxx npx ts-node agent.ts "Buat file hello.js lalu jalankan"
 *
 * Bisa override base URL & model buat provider compatible lain, contoh Ollama lokal:
 *   PROVIDER=openai OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_API_KEY=ollama \
 *     MODEL=qwen2.5-coder npx ts-node agent.ts "..."
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ============================================================
// Loader .env sederhana (tanpa dependency "dotenv")
// ============================================================

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    // Buang tanda kutip pembungkus kalau ada
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Jangan timpa env yang sudah diset manual dari shell
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env"));

// ============================================================
// Konfigurasi
// ============================================================

type Provider = "anthropic" | "openai";

const PROVIDER: Provider = (process.env.PROVIDER as Provider) || "anthropic";

const CONFIG = {
  anthropic: {
    baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com",
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.MODEL || "claude-sonnet-4-6",
  },
  openai: {
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.MODEL || "gpt-4o",
  },
}[PROVIDER];

const SYSTEM_PROMPT = process.env.SYSTEM_PROMPT || `Kamu adalah coding agent bernama "Umigent" yang berjalan pada model ${CONFIG.model}. Kamu punya akses ke tools untuk
membaca file, menulis file, dan menjalankan perintah shell. Gunakan tools
tersebut untuk menyelesaikan task dari user secara bertahap. Setelah task
selesai, jelaskan singkat apa yang sudah kamu lakukan.`;

const MAX_TURNS = 15;

// ============================================================
// UI Helpers — warna ANSI & spinner (tanpa dependency)
// ============================================================

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
  blue: "\x1b[34m",
};

function color(text: string, ...codes: string[]) {
  return `${codes.join("")}${text}${C.reset}`;
}

function printBanner() {
  console.log(color("┌─────────────────────────────────────────┐", C.gray));
  console.log(
    color("│  ", C.gray) +
      color("umigent", C.bold, C.cyan) +
      color(" — coding agent CLI", C.gray) +
      color("             │", C.gray)
  );
  console.log(color("└─────────────────────────────────────────┘", C.gray));
  console.log(
    color(`  provider: `, C.gray) +
      color(PROVIDER, C.magenta) +
      color(`   model: `, C.gray) +
      color(CONFIG.model, C.magenta)
  );
  console.log(color(`  ketik pesan lalu Enter · ":exit" untuk keluar\n`, C.gray));
}

function printUser(text: string) {
  console.log(color("You", C.bold, C.blue) + color(" › ", C.gray) + text);
}

function printAssistant(text: string) {
  if (!text) return;
  console.log(
    "\n" + color("● ", C.green) + color("Agent", C.bold, C.green) + "\n" + text
  );
}

function printToolCall(name: string, input: any) {
  const argStr = JSON.stringify(input);
  const shortArg = argStr.length > 80 ? argStr.slice(0, 80) + "…" : argStr;
  console.log(
    "\n" +
      color("  ⚙ ", C.yellow) +
      color(name, C.bold, C.yellow) +
      color(`(${shortArg})`, C.gray)
  );
}

function printToolResult(output: string) {
  const lines = output.split("\n").slice(0, 6);
  const preview = lines.join("\n").slice(0, 400);
  const truncated = output.length > preview.length ? "\n" + color("  …(dipotong)", C.gray) : "";
  console.log(
    color("  ↳ ", C.gray) +
      preview
        .split("\n")
        .map((l, i) => (i === 0 ? l : "    " + l))
        .join("\n") +
      truncated
  );
}

function printError(text: string) {
  console.log(color("✖ ", C.red) + color(text, C.red));
}

function printInfo(text: string) {
  console.log(color(text, C.gray));
}

// Spinner sederhana selagi menunggu respons API
function startSpinner(label: string) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  process.stdout.write("\n");
  const interval = setInterval(() => {
    process.stdout.write(`\r${color(frames[i], C.cyan)} ${color(label, C.gray)}  `);
    i = (i + 1) % frames.length;
  }, 80);
  return () => {
    clearInterval(interval);
    process.stdout.write("\r" + " ".repeat(label.length + 4) + "\r");
  };
}

// ============================================================
// Definisi tools — pakai satu bentuk generik (JSON Schema),
// nanti diformat ulang sesuai kebutuhan tiap provider.
// ============================================================

interface ToolDef {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

const TOOL_DEFS: ToolDef[] = [
  {
    name: "read_file",
    description: "Membaca isi sebuah file dari disk.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "Path file yang mau dibaca" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Menulis (membuat/menimpa) isi sebuah file di disk.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Path file tujuan" },
        content: { type: "string", description: "Isi file yang akan ditulis" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "run_command",
    description: "Menjalankan perintah shell dan mengembalikan output-nya.",
    parameters: {
      type: "object",
      properties: { command: { type: "string", description: "Perintah shell yang dijalankan" } },
      required: ["command"],
    },
  },
];

function executeTool(name: string, input: any): string {
  try {
    switch (name) {
      case "read_file":
        return fs.readFileSync(input.path, "utf-8");
      case "write_file":
        fs.writeFileSync(input.path, input.content, "utf-8");
        return `File berhasil ditulis ke ${input.path}`;
      case "run_command":
        return execSync(input.command, { encoding: "utf-8", timeout: 30_000 });
      default:
        return `Error: tool "${name}" tidak dikenal`;
    }
  } catch (err: any) {
    return `Error saat menjalankan tool ${name}: ${err.message}`;
  }
}

// ============================================================
// Internal representation percakapan yang provider-agnostic.
// Kita simpan dalam bentuk sederhana lalu convert ke format
// masing-masing provider saat memanggil API.
// ============================================================

type ToolCall = { id: string; name: string; input: any };

type ConvTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool_result"; toolCallId: string; toolName: string; output: string };

const conversation: ConvTurn[] = [];

// ============================================================
// Adapter: Anthropic (/v1/messages)
// ============================================================

async function callAnthropic(): Promise<{ text: string; toolCalls: ToolCall[]; done: boolean }> {
  const messages: any[] = [];

  for (const turn of conversation) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text });
    } else if (turn.role === "assistant") {
      const content: any[] = [];
      if (turn.text) content.push({ type: "text", text: turn.text });
      for (const tc of turn.toolCalls) {
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      }
      messages.push({ role: "assistant", content });
    } else if (turn.role === "tool_result") {
      messages.push({
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: turn.toolCallId, content: turn.output },
        ],
      });
    }
  }

  const body = {
    model: CONFIG.model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    tools: TOOL_DEFS.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    })),
    messages,
  };

  const res = await fetch(`${CONFIG.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": CONFIG.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  }

  const data: any = await res.json();

  let text = "";
  const toolCalls: ToolCall[] = [];

  for (const block of data.content) {
    if (block.type === "text") text += block.text;
    if (block.type === "tool_use") {
      toolCalls.push({ id: block.id, name: block.name, input: block.input });
    }
  }

  return { text, toolCalls, done: data.stop_reason !== "tool_use" };
}

// ============================================================
// Adapter: OpenAI-compatible (/chat/completions)
// ============================================================

async function callOpenAI(): Promise<{ text: string; toolCalls: ToolCall[]; done: boolean }> {
  const messages: any[] = [{ role: "system", content: SYSTEM_PROMPT }];

  for (const turn of conversation) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text });
    } else if (turn.role === "assistant") {
      const msg: any = { role: "assistant", content: turn.text || null };
      if (turn.toolCalls.length > 0) {
        msg.tool_calls = turn.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.input) },
        }));
      }
      messages.push(msg);
    } else if (turn.role === "tool_result") {
      messages.push({
        role: "tool",
        tool_call_id: turn.toolCallId,
        content: turn.output,
      });
    }
  }

  const body = {
    model: CONFIG.model,
    messages,
    tools: TOOL_DEFS.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
  };

  const res = await fetch(`${CONFIG.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${CONFIG.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`OpenAI-compatible API error ${res.status}: ${await res.text()}`);
  }

  const data: any = await res.json();
  const choice = data.choices[0];
  const msg = choice.message;

  const text = msg.content || "";
  const toolCalls: ToolCall[] = (msg.tool_calls || []).map((tc: any) => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments || "{}"),
  }));

  const done = choice.finish_reason !== "tool_calls";

  return { text, toolCalls, done };
}

async function callModel() {
  return PROVIDER === "anthropic" ? callAnthropic() : callOpenAI();
}

// ============================================================
// Satu putaran agent: kirim conversation ke model, eksekusi
// semua tool call yang diminta, ulangi sampai model berhenti
// minta tool (atau MAX_TURNS tercapai). Dipanggil sekali per
// pesan user dalam REPL.
// ============================================================

async function agentStep() {
  let turn = 0;

  while (turn < MAX_TURNS) {
    turn++;

    const stopSpinner = startSpinner("berpikir...");
    let result: { text: string; toolCalls: ToolCall[]; done: boolean };
    try {
      result = await callModel();
    } finally {
      stopSpinner();
    }

    const { text, toolCalls, done } = result;

    printAssistant(text);
    conversation.push({ role: "assistant", text, toolCalls });

    if (done || toolCalls.length === 0) {
      return;
    }

    for (const tc of toolCalls) {
      printToolCall(tc.name, tc.input);
      const output = executeTool(tc.name, tc.input);
      printToolResult(output);

      conversation.push({
        role: "tool_result",
        toolCallId: tc.id,
        toolName: tc.name,
        output,
      });
    }
  }

  printInfo("\n⚠ Berhenti karena mencapai batas maksimum turn untuk pesan ini.");
}

// ============================================================
// REPL — mode chat interaktif seperti opencode/chatbot
// ============================================================

import { startRepl as startAdvancedRepl } from "./src/agent.js";

async function startRepl() {
  if (!CONFIG.apiKey) {
    printError(
      `API key belum diset. Set env ${PROVIDER === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} (bisa lewat file .env).`
    );
    process.exit(1);
  }

  await startAdvancedRepl(CONFIG, PROVIDER);
}

// ============================================================
// Mode non-interaktif: kalau ada argumen CLI, jalankan sekali
// lalu keluar (berguna untuk scripting/CI). Tanpa argumen,
// masuk mode chat interaktif.
// ============================================================

import { runOnce as runOnceAdvanced } from "./src/agent.js";

async function runOnce(task: string) {
  if (!CONFIG.apiKey) {
    printError(
      `API key belum diset. Set env ${PROVIDER === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} (bisa lewat file .env).`
    );
    process.exit(1);
  }

  await runOnceAdvanced(task, CONFIG, PROVIDER);
}

// ============================================================
// Entry point
// ============================================================

const task = process.argv.slice(2).join(" ");

if (task) {
  runOnce(task).catch((err) => {
    printError(err.message || String(err));
    process.exit(1);
  });
} else {
  startRepl().catch((err) => {
    printError(err.message || String(err));
    process.exit(1);
  });
}