// ============================================================
// Umigent — Entry Point
// ============================================================

try { process.noDeprecation = true } catch { /* readonly in Node 22+ */ }

import { Provider } from "./types.js";
import { getProviderConfig } from "./config.js";
import { startRepl, runOnce } from "./agent.js";
import { printError } from "./ui.js";

const provider: Provider = (process.env.PROVIDER as Provider) || "anthropic";
const config = getProviderConfig(provider);

if (!config.apiKey) {
  printError(
    `API key not set. Set env ${
      provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"
    } (via .env file).`
  );
  process.exit(1);
}

const task = process.argv.slice(2).join(" ");

if (task) {
  runOnce(task, config, provider).catch((err) => {
    printError(err.message || String(err));
    process.exit(1);
  });
} else {
  startRepl(config, provider).catch((err) => {
    printError(err.message || String(err));
    process.exit(1);
  });
}