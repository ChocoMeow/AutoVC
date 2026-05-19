import type { AppContext } from '@/app-context.ts';
import { DiscordTaskQueue } from '@/infra/discord-task-queue.ts';
import { runVoiceRecovery } from '@/infra/voice-recovery.ts';

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let sweepRunning = false;

export function startVoiceRecoveryScheduler(app: AppContext, queue: DiscordTaskQueue): void {
  const minutes = app.config.recovery.intervalMinutes;
  if (minutes <= 0) return;

  const ms = minutes * 60_000;

  intervalHandle = setInterval(() => {
    void runScheduledSweep(app, queue);
  }, ms);

  app.logger.info({ intervalMinutes: minutes }, 'Voice recovery interval scheduled');
}

export function stopVoiceRecoveryScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

async function runScheduledSweep(app: AppContext, queue: DiscordTaskQueue): Promise<void> {
  if (sweepRunning) {
    app.logger.debug('Skipping voice recovery — previous sweep still running');
    return;
  }

  if (queue.pending > 0) {
    app.logger.debug({ pending: queue.pending }, 'Skipping voice recovery — queue busy');
    return;
  }

  sweepRunning = true;
  try {
    await runVoiceRecovery(app, queue, { reason: 'interval' });
  } finally {
    sweepRunning = false;
  }
}

export async function runStartupVoiceRecovery(
  app: AppContext,
  queue: DiscordTaskQueue,
): Promise<void> {
  if (!app.config.recovery.onStartup) return;
  await runVoiceRecovery(app, queue, { reason: 'startup' });
}
