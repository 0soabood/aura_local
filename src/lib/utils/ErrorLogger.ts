/**
 * Centralized Error Logger for AURA
 *
 * Singleton-style logger with per-agent named instances.
 * Features:
 *   - Log levels: debug, info, warn, error
 *   - Structured JSON output to rotating log files in logs/
 *   - Human-readable console output in development
 *   - Per-agent context (agent name, sessionId)
 *   - Broadcasts errors to the UI via broadcastEvent
 *   - Catches its own errors — never throws
 *
 * Usage:
 *   import { getErrorLogger } from '../utils/ErrorLogger';
 *   const log = getErrorLogger('ResearchAgent');
 *   log.error('Failed to read file', { path, error }, sessionId);
 *   log.info('Task completed', { durationMs: 1234 });
 */

import { broadcastEvent } from '../debug';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';

// ── Types ───────────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
};

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  agent: string;
  sessionId?: string;
  message: string;
  data?: Record<string, unknown>;
}

// ── Constants ────────────────────────────────────────────────────────────────

const LOGS_DIR = path.resolve(process.cwd(), 'logs');
const MAX_FILE_SIZE = 10 * 1024 * 1024;          // 10 MB before rotation
const MAX_LOG_DAYS  = 7;                          // purge files older than this
const CLEANUP_KEY   = 'aura_error_logger_cleanup'; // sessionStorage key for daily cleanup

const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

// ── Logger class ─────────────────────────────────────────────────────────────

export class ErrorLogger {
  private readonly agentName: string;
  private dirReady = false;
  private dirPromise: Promise<void> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(agentName: string) {
    this.agentName = agentName;
    // Kick off directory creation once; subsequent instances share the same fs
    if (!this.dirPromise) {
      this.dirPromise = this.ensureLogsDir().then(() => {
        this.dirReady = true;
      }).catch(() => {
        // Logger never throws — console fallback is fine
        this.dirReady = false;
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  debug(message: string, data?: Record<string, unknown>, sessionId?: string): void {
    this.write('debug', message, data, sessionId);
  }

  info(message: string, data?: Record<string, unknown>, sessionId?: string): void {
    this.write('info', message, data, sessionId);
  }

  warn(message: string, data?: Record<string, unknown>, sessionId?: string): void {
    this.write('warn', message, data, sessionId);
  }

  error(message: string, data?: Record<string, unknown>, sessionId?: string): void {
    this.write('error', message, data, sessionId);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private write(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    sessionId?: string,
  ): void {
    try {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        agent: this.agentName,
        sessionId,
        message,
        data,
      };

      // 1. Console output (always in dev; always for errors)
      if (isDev || level === 'error') {
        this.consoleOut(entry);
      }

      // 2. File output (async, queued for ordering)
      if (this.dirReady) {
        this.writeQueue = this.writeQueue
          .then(() => this.appendToFile(entry))
          .catch(() => { /* already handled inside appendToFile */ });
      }

      // 3. Broadcast errors to the UI via the debug event system
      if (level === 'error' && sessionId) {
        this.broadcastError(entry);
      }
    } catch {
      // Absolute last resort — logger never throws
    }
  }

  private consoleOut(entry: LogEntry): void {
    const label = `[${entry.timestamp.slice(11, 19)}] [${entry.level.toUpperCase()}] [${entry.agent}]`;
    const msg = `${label} ${entry.message}`;
    const extra = entry.data ?? '';

    switch (entry.level) {
      case 'error':
        console.error(`[ErrorLogger] ${msg}`, extra);
        break;
      case 'warn':
        console.warn(`[ErrorLogger] ${msg}`, extra);
        break;
      case 'debug':
        console.debug(`[ErrorLogger] ${msg}`, extra);
        break;
      default:
        console.log(`[ErrorLogger] ${msg}`, extra);
    }
  }

  private broadcastError(entry: LogEntry): void {
    try {
      broadcastEvent(entry.sessionId!, {
        event_type: 'log_error',
        author:     entry.agent,
        content:    `[${entry.level.toUpperCase()}] ${entry.message}`,
        metadata:   { data: entry.data },
      });
    } catch {
      // Swallow — broadcastEvent can fail on malformed sessionId
    }
  }

  // ── File I/O ────────────────────────────────────────────────────────────

  private async ensureLogsDir(): Promise<void> {
    await fs.mkdir(LOGS_DIR, { recursive: true });
    // Run cleanup once per process start (first instance)
    this.cleanupOldLogs();
  }

  private getLogPath(): string {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return path.join(LOGS_DIR, `${today}.log`);
  }

  private async appendToFile(entry: LogEntry): Promise<void> {
    try {
      const logPath = this.getLogPath();

      // Check size and rotate if needed
      try {
        const stat = await fs.stat(logPath);
        if (stat.size >= MAX_FILE_SIZE) {
          const suffix = Date.now();
          await fs.rename(logPath, logPath.replace('.log', `-${suffix}.log`));
        }
      } catch {
        // File doesn't exist yet — first write
      }

      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(logPath, line, 'utf-8');
    } catch {
      // Silently fall back to console-only — logger never throws
    }
  }

  private async cleanupOldLogs(): Promise<void> {
    try {
      const cutoff = Date.now() - MAX_LOG_DAYS * 86_400_000;
      const files = await fs.readdir(LOGS_DIR);
      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        const filePath = path.join(LOGS_DIR, file);
        try {
          const stat = await fs.stat(filePath);
          if (stat.mtimeMs < cutoff) {
            await fs.unlink(filePath);
          }
        } catch {
          // skip files we can't stat or delete
        }
      }
    } catch {
      // logs/ doesn't exist yet or can't be read — nothing to clean
    }
  }
}

// ── Factory / singleton registry ─────────────────────────────────────────────

const instances = new Map<string, ErrorLogger>();

/**
 * Get or create a named ErrorLogger instance.
 *
 * Agents should call this once at module level or in their constructor and
 * keep the returned reference for the lifetime of the agent.
 *
 * @example
 *   const log = getErrorLogger('ResearchAgent');
 *   log.error('Failed to read file', { path, error }, sessionId);
 *   log.info('Task finished', { durationMs: 1200 });
 */
export function getErrorLogger(agentName: string): ErrorLogger {
  let instance = instances.get(agentName);
  if (!instance) {
    instance = new ErrorLogger(agentName);
    instances.set(agentName, instance);
  }
  return instance;
}
