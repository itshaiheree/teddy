// ============================================================
// OpenAI-compatible API adapter — /chat/completions
// ============================================================

import { ProviderConfig, ConvTurn, ToolCall } from "../types.js";
import { TOOL_DEFS } from "../tools.js";
import { getSystemPrompt } from "../config.js";

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

  const text = msg.content || "";
  const toolCalls: ToolCall[] = (msg.tool_calls || []).map((tc: any) => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments || "{}"),
  }));

  const done = choice.finish_reason !== "tool_calls";

  return { text, toolCalls, done };
}