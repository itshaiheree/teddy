// ============================================================
// Agent — agent loop, REPL, and run-once mode
// ============================================================

import { Provider, ProviderConfig, ConvTurn, ToolCall } from "./types.js";
import { callAnthropic } from "./providers/anthropic.js";
import { callOpenAI } from "./providers/openai.js";
import { executeTool, resetRunCommandConsent } from "./tools.js";
import { MAX_TURNS } from "./config.js";
import {
  clearScreen,
  printBanner,
  printStatusBar,
  printUser,
  printAssistant,
  printToolCall,
  printToolResult,
  printError,
  printWarning,
  printInfo,
  printSuccess,
  printHelp,
  printExitConfirm,
  startSpinner,
  color,
  C,
} from "./ui.js";
import {
  createSession,
  saveSession,
  getLatestSession,
  formatSessionMeta,
} from "./session.js";
import { showSessionPicker } from "./session-picker.js";
import {
  setupRawInput,
  restoreInput,
  onKey,
  readLine,
  clearInputBuffer,
} from "./input-handler.js";
import { Session } from "./types.js";

// --- Model Call ---

async function callModel(
  conversation: ConvTurn[],
  config: ProviderConfig,
  provider: Provider,
  signal?: AbortSignal
): Promise<{ text: string; toolCalls: ToolCall[]; done: boolean }> {
  return provider === "anthropic"
    ? callAnthropic(conversation, config, signal)
    : callOpenAI(conversation, config, signal);
}

// --- Record + save a runtime error so it survives session resume ---

function recordError(session: Session, message: string): void {
  session.conversation.push({ role: "error", text: message });
  saveSession(session);
}

// --- Agent Step ---

async function agentStep(
  session: Session,
  config: ProviderConfig,
  provider: Provider,
  signal?: AbortSignal
): Promise<void> {
  let turn = 0;

  while (turn < MAX_TURNS) {
    signal?.throwIfAborted();
    turn++;

    const stopSpinner = startSpinner("thinking...");
    let result: { text: string; toolCalls: ToolCall[]; done: boolean };
    try {
      result = await callModel(session.conversation, config, provider, signal);
    } catch (err: any) {
      stopSpinner();
      // Persist the failure into the session instead of only printing it —
      // otherwise the error trail is lost the moment the process exits or
      // the session is saved/reloaded.
      const message = err?.message || String(err);
      if (err?.name !== "AbortError") {
        recordError(session, message);
      }
      throw err;
    } finally {
      stopSpinner();
    }

    const { text, toolCalls, done } = result;

    printAssistant(text);
    session.conversation.push({ role: "assistant", text, toolCalls });

    if (done || toolCalls.length === 0) {
      if (session.firstMessage === "(new session)") {
        const firstUser = session.conversation.find((t) => t.role === "user");
        if (firstUser && firstUser.role === "user") {
          session.firstMessage = firstUser.text;
        }
      }
      return;
    }

    for (const tc of toolCalls) {
      signal?.throwIfAborted();
      const stopTool = printToolCall(tc.name, tc.input);

      let output: string;
      try {
        output = await executeTool(tc.name, tc.input);
      } catch (err: any) {
        // Tool execution failures are real, recordable events too — capture
        // them as the tool's output AND as a dedicated error turn so both
        // the transcript and the error trail reflect what happened.
        const message = err?.message || String(err);
        output = `Error: ${message}`;
        stopTool(output);
        session.conversation.push({
          role: "tool_result",
          toolCallId: tc.id,
          toolName: tc.name,
          output,
        });
        recordError(session, `Tool "${tc.name}" failed: ${message}`);
        continue;
      }

      if (tc.name === "run_command") {
        stopTool(output);
      } else {
        stopTool();
        printToolResult(output);
      }

      session.conversation.push({
        role: "tool_result",
        toolCallId: tc.id,
        toolName: tc.name,
        output,
      });
    }
  }

  const limitMsg = "Stopped: reached maximum turn limit for this message.";
  printWarning(`\n⚠ ${limitMsg}`);
  recordError(session, limitMsg);
}

// --- REPL ---

function renderHistory(session: Session): void {
  printInfo(
    color("Resumed session  ", C.gray) +
    color(`model: ${session.model}`, C.bold, C.cyan) +
    color("  |  ", C.gray) +
    color(`${session.turnCount} turns`, C.dim) +
    "\n"
  );
  for (const turn of session.conversation) {
    if (turn.role === "user") {
      printUser(turn.text);
    } else if (turn.role === "assistant") {
      printAssistant(turn.text);
    } else if (turn.role === "tool_result") {
      // Replay tool calls/results so resumed sessions show the same
      // command/output trail that was visible when they first ran,
      // instead of silently dropping them.
      const stopTool = printToolCall(turn.toolName, {});
      if (turn.toolName === "run_command") {
        stopTool(turn.output);
      } else {
        stopTool();
        printToolResult(turn.output);
      }
    } else if (turn.role === "error") {
      printError(turn.text);
    }
  }
}

export async function startRepl(
  config: ProviderConfig,
  provider: Provider
): Promise<void> {
  resetRunCommandConsent();
  clearScreen();

  let session: Session;
  const latest = getLatestSession();

  if (latest) {
    const meta = formatSessionMeta(latest);
    printBanner(provider, config, meta, latest.turnCount);
    printInfo(
      color("Last session found: ", C.gray) +
        color(meta, C.cyan) +
        "\n"
    );
    printInfo(
      color("Type ", C.gray) +
        color(":new", C.bold, C.cyan) +
        color(" for a new session, or continue chatting.", C.gray) +
        "\n"
    );
    session = latest;
    renderHistory(session);
  } else {
    session = createSession(undefined, config.model);
    printBanner(provider, config, "new session", 0);
    printInfo(
      color("Type a message and press Enter · ", C.gray) +
        color(":help", C.cyan) +
        color(" for help\n", C.gray)
    );
  }

  printStatusBar();

  let currentAbort: AbortController | null = null;
  let ctrlDTimer: ReturnType<typeof setTimeout> | null = null;

  setupRawInput();

  onKey(async (event) => {
    if (event.type === "ctrl_o") {
      clearScreen();
      clearInputBuffer();

      showSessionPicker().then((result) => {
        if (result.action === "select") {
          session = result.session;
          clearScreen();
          const meta = formatSessionMeta(session);
          printBanner(provider, config, meta, session.turnCount);
          printInfo(
            color("Session loaded: ", C.gray) + color(meta, C.cyan) + "\n"
          );
          renderHistory(session);
        } else if (result.action === "new") {
          saveSession(session);
          session = createSession(undefined, config.model);
          clearScreen();
          printBanner(provider, config, "new session", 0);
        } else {
          clearScreen();
          const meta = formatSessionMeta(session);
          printBanner(provider, config, meta, session.turnCount);
          renderHistory(session);
        }
        printStatusBar();
        process.stdout.write(
          color("You", C.bold, C.deepBlue) + color(" › ", C.gray)
        );
      });
    }

    if (event.type === "ctrl_h") {
      printHelp();
    }

    if (event.type === "ctrl_c") {
      session.conversation = [];
      session.firstMessage = "(new session)";
      saveSession(session);
      clearScreen();
      printBanner(provider, config, "new session (cleared)", 0);
      printStatusBar();
      resetRunCommandConsent();
    }

    if (event.type === "ctrl_e") {
      saveSession(session);
      printExitConfirm(formatSessionMeta(session));
      restoreInput();
      process.exit(0);
    }

    if (event.type === "ctrl_d") {
      if (currentAbort && !currentAbort.signal.aborted) {
        if (ctrlDTimer) {
          clearTimeout(ctrlDTimer);
          ctrlDTimer = null;
          currentAbort.abort();
          printWarning("\n⚠  Aborted — returning to prompt");
          process.stdout.write(
            color("You", C.bold, C.deepBlue) + color(" › ", C.gray)
          );
        } else {
          ctrlDTimer = setTimeout(() => { ctrlDTimer = null; }, 2000);
          printWarning("\n⚠  Press Ctrl+D again to abort");
          process.stdout.write(
            color("You", C.bold, C.deepBlue) + color(" › ", C.gray)
          );
        }
      }
    }
    if (event.type === "ctrl_n") {
      process.stdout.write("\r\x1b[K");
      clearInputBuffer();
      saveSession(session);
      session = createSession(undefined, config.model);
      clearScreen();
      printBanner(provider, config, "new session", 0);
      printStatusBar();
      resetRunCommandConsent();
      process.stdout.write(
        color("You", C.bold, C.deepBlue) + color(" › ", C.gray)
      );
    }
  });

  const prompt = color("You", C.bold, C.deepBlue) + color(" › ", C.gray);

  while (true) {
    const line = await readLine(prompt);
    const input = line.trim();

    if (!input) continue;

    if (input === ":exit" || input === ":quit") {
      saveSession(session);
      printExitConfirm(formatSessionMeta(session));
      restoreInput();
      process.exit(0);
    }

    if (input === ":help") {
      printHelp();
      continue;
    }

    if (input === ":clear") {
      session.conversation = [];
      session.firstMessage = "(new session)";
      saveSession(session);
      clearScreen();
      printBanner(provider, config, "new session (cleared)", 0);
      printStatusBar();
      resetRunCommandConsent();
      continue;
    }

    if (input === ":new") {
      saveSession(session);
      session = createSession(undefined, config.model);
      clearScreen();
      printBanner(provider, config, "new session", 0);
      printStatusBar();
      resetRunCommandConsent();
      continue;
    }

    if (input === ":sessions") {
      clearScreen();
      const result = await showSessionPicker();
      if (result.action === "select") {
        session = result.session;
        resetRunCommandConsent();
        clearScreen();
        const meta = formatSessionMeta(session);
        printBanner(provider, config, meta, session.turnCount);
        printInfo(
          color("Session loaded: ", C.gray) + color(meta, C.cyan) + "\n"
        );
        renderHistory(session);
      } else if (result.action === "new") {
        saveSession(session);
        session = createSession(undefined, config.model);
        clearScreen();
        printBanner(provider, config, "new session", 0);
      } else {
        clearScreen();
        const meta = formatSessionMeta(session);
        printBanner(provider, config, meta, session.turnCount);
        renderHistory(session);
      }
      printStatusBar();
      continue;
    }

    session.conversation.push({ role: "user", text: input });

    currentAbort = new AbortController();
    try {
      await agentStep(session, config, provider, currentAbort.signal);
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        printError(err.message || String(err));
        // Note: the error itself is already recorded into
        // session.conversation inside agentStep()/recordError() at the
        // point of failure, so it survives even if the process crashes
        // right after this catch block.
      }
    } finally {
      currentAbort = null;
    }

    saveSession(session);
    console.log();
  }
}

// --- Run Once ---

export async function runOnce(
  task: string,
  config: ProviderConfig,
  provider: Provider
): Promise<void> {
  resetRunCommandConsent();
  clearScreen();
  printBanner(provider, config);

  const session = createSession(task, config.model);
  printUser(task);
  session.conversation.push({ role: "user", text: task });

  try {
    await agentStep(session, config, provider);
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      printError(err.message || String(err));
    }
  } finally {
    saveSession(session);
    // Restore terminal state (cooked mode + release the stdin handle). A
    // run_command consent leaves stdin raw+flowing, which would otherwise
    // keep the Node event loop alive and prevent a one-shot task from ever
    // exiting cleanly.
    restoreInput();
  }
}