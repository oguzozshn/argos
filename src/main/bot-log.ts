import { app } from "electron";
import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Telegram bot's own log file, beside the start-up diagnostics.
 *
 * The bot reports its turns to `console.error` and to the tray. Neither
 * survives: a packaged app has no console anyone reads, and the tray only
 * keeps the last turn. So a queued task that Argos silently failed to write
 * left no trace at all — the queue just kept it, and the next turn failed the
 * same way, for days.
 *
 * Every turn is written here instead, success included: without the quiet
 * turns, a failure says nothing about whether the bot had been running.
 */

const LOG_NAME = "argos-bot.log";
/** Rotated above this; a turn is one short line, so this is weeks of them. */
const MAX_BYTES = 256 * 1024;
/** How much of the tail survives a rotation. */
const KEEP_BYTES = 128 * 1024;

const logPath = (): string => join(app.getPath("userData"), LOG_NAME);

/** Drops the oldest half, cutting at a line break so no half line is left. */
function rotate(path: string): void {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return; // not there yet
  }
  if (size <= MAX_BYTES) return;
  const text = readFileSync(path, "utf8");
  const kept = text.slice(-KEEP_BYTES);
  const firstBreak = kept.indexOf("\n");
  writeFileSync(path, firstBreak === -1 ? kept : kept.slice(firstBreak + 1), "utf8");
}

/** One line, timestamped. Never throws: logging must not take the bot down. */
export function botLog(line: string): void {
  try {
    const path = logPath();
    rotate(path);
    appendFileSync(path, `${new Date().toISOString()} ${line}\r\n`, "utf8");
  } catch {
    // Disk full, folder gone, file locked: the bot carries on regardless.
  }
}
