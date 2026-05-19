import { mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import pino from 'pino';
import type { Config } from '@/config/load.ts';

function resolveLogDir(config: Config): string {
  const dir = config.logging.directory;
  return join(process.cwd(), dir);
}

function rotateIfOversized(logPath: string, maxFileSizeMb: number): void {
  try {
    const { size } = statSync(logPath);
    if (size < maxFileSizeMb * 1024 * 1024) return;

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    renameSync(logPath, `${logPath}.${stamp}`);
  } catch {
    // file may not exist yet
  }
}

function pruneOldLogs(logDir: string, fileName: string, maxHistory: number): void {
  const base = fileName.replace(/\.log$/i, '');
  const rotated = readdirSync(logDir)
    .filter((f) => f.startsWith(`${fileName}.`) || (f.startsWith(base) && f.endsWith('.log')))
    .map((f) => ({ name: f, mtime: statSync(join(logDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  for (const file of rotated.slice(maxHistory)) {
    try {
      unlinkSync(join(logDir, file.name));
    } catch {
      // ignore
    }
  }
}

export function createLogger(config: Config) {
  const logDir = resolveLogDir(config);
  mkdirSync(logDir, { recursive: true });

  const logPath = join(logDir, config.logging.fileName);
  rotateIfOversized(logPath, config.logging.maxFileSizeMb);
  pruneOldLogs(logDir, config.logging.fileName, config.logging.maxHistory);

  const streams: pino.StreamEntry[] = [
    {
      stream: pino.destination({ dest: logPath, mkdir: true, sync: false }),
    },
  ];

  if (config.logging.console) {
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev) {
      streams.push({
        stream: pino.transport({ target: 'pino-pretty', options: { colorize: true } }),
      });
    } else {
      streams.push({ stream: process.stdout });
    }
  }

  return pino({ level: config.runtime.logLevel }, pino.multistream(streams));
}

export type Logger = ReturnType<typeof createLogger>;
