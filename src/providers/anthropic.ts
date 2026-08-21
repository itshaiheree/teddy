// ============================================================
// Anthropic API adapter — /v1/messages
// ============================================================

import { ProviderConfig, ConvTurn, ToolCall } from "../types.js";
import { TOOL_DEFS } from "../tools.js";
import { getSystemPrompt } from "../config.js";

export async function callAnthropic(
  conversation: ConvTurn[],
  config: ProviderConfig,
  signal?: AbortSignal
): Promise<{ text: string; toolCalls: ToolCall[]; done: boolean }> {
  const messages: any[] = [];

  for (const turn of conversation) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text });
    } else if (turn.role === "assistant") {
      const content: any[] = [];
      if (turn.text) content.push({ type: "text", text: turn.text });
      for (const tc of turn.toolCalls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.name,
          input: tc.input,
        });
      }
      messages.push({ role: "assistant", content });
    } else if (turn.role === "tool_result") {
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: turn.toolCallId,
            content: turn.output,
          },
        ],
      });
    }
  }

  const body = {
    model: config.model,
    max_tokens: 2048,
    system: getSystemPrompt(config.model),
    tools: TOOL_DEFS.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    })),
    messages,
  };

  const res = await fetch(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
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