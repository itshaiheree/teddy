// ============================================================
// Session Management — CRUD for chat sessions
// ============================================================

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { getSessionDir } from "./config.js";
import { Session, SessionMeta, ConvTurn } from "./types.js";

// --- Ensure directory exists ---

export function ensureSessionDir(): void {
  const dir = getSessionDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- Helpers ---

function sessionPath(id: string): string {
  return path.join(getSessionDir(), `${id}.json`);
}

function generateId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toISOString().slice(11, 19).replace(/:/g, "");
  const rand = crypto.randomBytes(2).toString("hex");
  return `${date}-${time}-${rand}`;
}

// --- List all sessions (sorted by updatedAt DESC) ---

export function listSessions(): SessionMeta[] {
  ensureSessionDir();
  const dir = getSessionDir();
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f));

  const sessions: SessionMeta[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, "utf-8");
      const session: Session = JSON.parse(raw);
      sessions.push({
        id: session.id,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        firstMessage: session.firstMessage || "(new session)",
        turnCount: session.turnCount,
        model: session.model || "unknown",
      });
    } catch {
      // Skip corrupted files
    }
  }

  sessions.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return sessions;
}

// --- Load a session ---

export function loadSession(id: string): Session | null {
  const filePath = sessionPath(id);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const session = JSON.parse(raw) as Session;
    // Older session files may predate the `model` field — normalize so it
    // never surfaces as the literal string "undefined" in the UI.
    session.model = session.model || "unknown";
    session.firstMessage = session.firstMessage || "(new session)";
    return session;
  } catch {
    return null;
  }
}

// --- Save a session ---

export function saveSession(session: Session): void {
  ensureSessionDir();
  session.updatedAt = new Date().toISOString();
  session.turnCount = session.conversation.filter(
    (t) => t.role === "user"
  ).length;

  const filePath = sessionPath(session.id);
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
}

// --- Delete a session ---

export function deleteSession(id: string): boolean {
  const filePath = sessionPath(id);
  if (!fs.existsSync(filePath)) return false;

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

// --- Create a new session ---

export function createSession(firstMessage?: string, model?: string): Session {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    createdAt: now,
    updatedAt: now,
    firstMessage: firstMessage || "(new session)",
    turnCount: 0,
    model: model || "unknown",
    conversation: [],
  };
}

// --- Get latest session (for auto-resume) ---

export function getLatestSession(): Session | null {
  const sessions = listSessions();
  if (sessions.length === 0) return null;
  return loadSession(sessions[0].id);
}

// --- Format session for display ---

export function formatSessionMeta(meta: SessionMeta): string {
  const date = new Date(meta.updatedAt);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
  });
  const timeStr = date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const firstMsg =
    meta.firstMessage.length > 50
      ? meta.firstMessage.slice(0, 47) + "..."
      : meta.firstMessage;

  return `${dateStr} ${timeStr}  (${meta.turnCount} turns)  [${meta.model}]  "${firstMsg}"`;
}