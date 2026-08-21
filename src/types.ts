// ============================================================
// Shared types for Umigent
// ============================================================

/** Supported providers */
export type Provider = "anthropic" | "openai";

/** Provider configuration */
export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Tool definition (JSON Schema) */
export interface ToolDef {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

/** A single tool call from the model */
export interface ToolCall {
  id: string;
  name: string;
  input: any;
}

/** A single turn in the conversation */
export type ConvTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool_result"; toolCallId: string; toolName: string; output: string }
  | { role: "error"; text: string };

/** Session metadata (stored in the list) */
export interface SessionMeta {
  id: string;
  createdAt: string;
  updatedAt: string;
  firstMessage: string;
  turnCount: number;
  model: string;
}

/** Full session with conversation */
export interface Session extends SessionMeta {
  conversation: ConvTurn[];
}

/** Key event from raw input handler */
export interface KeyEvent {
  type: "char" | "enter" | "backspace" | "f1" | "up" | "down" | "left" | "right" | "ctrl_c" | "ctrl_o" | "ctrl_h" | "ctrl_e" | "ctrl_d" | "ctrl_n" | "tab";
  char?: string;
}