// ============================================================
// OpenAI-compatible API adapter — /chat/completions
// ============================================================

import { ProviderConfig, ConvTurn, ToolCall } from "../types.js";
import { TOOL_DEFS } from "../tools.js";
import { getSystemPrompt } from "../config.js";

// Safely parse a tool-call "arguments" payload. Some providers/models emit
// malformed JSON here; returning {} keeps the turn alive (the tool then reports
// any missing required params, which the model can recover from) instead of
// crashing the whole request.
function safeParseArgs(raw: string | undefined): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}

// Fallback for models that emit a tool call as plain text in `content` rather
// than the structured `tool_calls` field. To keep false positives effectively
// impossible, we only treat it as a tool call when the ENTIRE trimmed content
// is a single JSON object AND its tool name matches a known TOOL_DEFS entry.
function recoverToolCallFromText(text: string): ToolCall | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;

  let obj: any;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const name: unknown = obj.name ?? obj.tool ?? obj.tool_name ?? obj.function?.name;
  if (typeof name !== "string") return null;
  if (!TOOL_DEFS.some((d) => d.name === name)) return null;

  const rawArgs: any =
    obj.arguments ?? obj.input ?? obj.parameters ?? obj.args ?? obj.function?.arguments;
  const input = typeof rawArgs === "string" ? safeParseArgs(rawArgs) : rawArgs ?? {};
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;

  return { id: `recovered_${Date.now()}`, name, input };
}

export async function callOpenAI(
  conversation: ConvTurn[],
  config: ProviderConfig,
  signal?: AbortSignal
): Promise<{ text: string; toolCalls: ToolCall[]; done: boolean }> {
  const messages: any[] = [
    { role: "system", content: getSystemPrompt(config.model) },
  ];

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
    model: config.model,
    messages,
    tools: TOOL_DEFS.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })),
    // Explicit so OpenAI-compatible providers with non-standard defaults still
    // allow the model to call tools.
    tool_choice: "auto",
  };

  const res = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    throw new Error(
      `OpenAI-compatible API error ${res.status}: ${await res.text()}`
    );
  }

  const data: any = await res.json();
  const choice = data.choices[0];
  const msg = choice.message;

  let text = msg.content || "";
  let toolCalls: ToolCall[] = (msg.tool_calls || []).map((tc: any) => ({
    id: tc.id,
    name: tc.function.name,
    input: safeParseArgs(tc.function.arguments),
  }));

  let done = choice.finish_reason !== "tool_calls";

  // Some OpenAI-compatible models put the tool call in `content` (as text)
  // instead of the structured `tool_calls` field — recover it when unambiguous.
  if (toolCalls.length === 0) {
    const recovered = recoverToolCallFromText(text);
    if (recovered) {
      toolCalls = [recovered];
      text = ""; // don't surface the raw JSON as the assistant's reply
      done = false; // ensure the agent loop actually executes the call
    }
  }

  return { text, toolCalls, done };
}