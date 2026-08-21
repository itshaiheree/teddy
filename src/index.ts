// ============================================================
// TEDDY — Entry Point
// ============================================================

try { process.noDeprecation = true } catch { /* readonly in Node 22+ */ }

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { Provider } from "./types.js";
import { getProviderConfig } from "./config.js";
import { startRepl, runOnce } from "./agent.js";
import { printError } from "./ui.js";

// ============================================================
// Loader .env sederhana (tanpa dependency "dotenv")
// Dicari di ~/.teddy/.env dulu, baru ./.env (cwd) sebagai
// fallback/override. loadEnvFile tidak menimpa env yang sudah
// ada, jadi yang di-load duluan lebih menang.
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

const TEDDY_DIR = path.join(os.homedir(), ".teddy");
const TEDDY_ENV_PATH = path.join(TEDDY_DIR, ".env");

if (!fs.existsSync(TEDDY_DIR)) {
  try {
    fs.mkdirSync(TEDDY_DIR, { recursive: true });
  } catch {
    // diem aja kalau gagal bikin folder, ga fatal
  }
}

loadEnvFile(TEDDY_ENV_PATH);
loadEnvFile(path.resolve(process.cwd(), ".env"));

// ============================================================
// Bootstrap
// ============================================================

const provider: Provider = (process.env.PROVIDER as Provider) || "anthropic";
const config = getProviderConfig(provider);

if (!config.apiKey) {
  printError(
    `API key not set. Set env ${
      provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"
    } (via ${TEDDY_ENV_PATH} or .env in the current folder).`
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