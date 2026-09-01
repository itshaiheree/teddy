// ============================================================
// Config — Load .env, provider config, constants
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { Provider, ProviderConfig } from "./types.js";

// --- Load .env ---

export function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf-8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;

    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Load .env from cwd
loadEnvFile(path.resolve(process.cwd(), ".env"));

// --- Provider Config ---

export function getProviderConfig(provider: Provider): ProviderConfig {
  const configs: Record<Provider, ProviderConfig> = {
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
  };
  return configs[provider];
}

// --- Constants ---

export const MAX_TURNS = 15;

const TOOL_USAGE =
  "You have access to tools to read files, write files, and run shell commands. " +
  "You MUST use these tools to actually perform any file or command action — invoke the tool directly instead of only describing the action or printing the code/output in your reply. " +
  "When a request implies creating, reading, or modifying files, or running commands, always respond with the appropriate tool call. " +
  "Use the tools step by step to solve the user's task. After the task is complete, briefly explain what you did.";

export function getSystemPrompt(model: string): string {
  return process.env.SYSTEM_PROMPT
    ? `${process.env.SYSTEM_PROMPT}  ${TOOL_USAGE}`
    : `You are a coding agent named "Teddy" running on model ${model}. ${TOOL_USAGE}`;
}

// --- Session Dir ---

export function getSessionDir(): string {
  const home = process.env.USERPROFILE || process.env.HOME || process.env.HOMEPATH || ".";
  return path.resolve(home, ".teddy", "sessions");
}