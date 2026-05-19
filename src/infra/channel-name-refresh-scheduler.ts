import type { AppContext } from '@/app-context.ts';
import { ChannelRenameLimiter } from '@/infra/channel-rename-limiter.ts';
import {
  refreshTempChannelName,
  runChannelNameRefresh,
} from '@/infra/channel-name-refresh.ts';
import type { DiscordTaskQueue } from '@/infra/discord-task-queue.ts';

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let sweepRunning = false;
let limiter: ChannelRenameLimiter | null = null;
let refreshQueue: DiscordTaskQueue | null = null;
const pendingRefresh = new Map<string, ReturnType<typeof setTimeout>>();

const REFRESH_DEBOUNCE_MS = 2_000;

export function getChannelRenameLimiter(app: AppContext): ChannelRenameLimiter {
  if (!limiter) {
    const cfg = app.config.channelNameRefresh;
    limiter = new ChannelRenameLimiter(cfg.maxRenamesPerChannel, cfg.windowMinutes * 60_000);
  }
  return limiter;
}

export function startChannelNameRefreshScheduler(
  app: AppContext,
  queue: DiscordTaskQueue,
): void {
  const cfg = app.config.channelNameRefresh;
  if (!cfg.enabled || cfg.intervalSeconds <= 0) return;

  const ms = cfg.intervalSeconds * 1000;
  getChannelRenameLimiter(app);
  refreshQueue = queue;

  intervalHandle = setInterval(() => {
    void runScheduledRefresh(app, queue);
  }, ms);

  app.logger.info(
    {
      intervalSeconds: cfg.intervalSeconds,
      maxRenamesPerChannel: cfg.maxRenamesPerChannel,
      windowMinutes: cfg.windowMinutes,
    },
    'Channel name refresh interval scheduled',
  );
}

export function stopChannelNameRefreshScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  refreshQueue = null;
  for (const timer of pendingRefresh.values()) clearTimeout(timer);
  pendingRefresh.clear();
}

/** Debounced rename when placeholders (e.g. {game}) change for a temp channel. */
export function scheduleTempChannelNameRefresh(app: AppContext, channelId: string): void {
  if (!app.config.channelNameRefresh.enabled || !refreshQueue) return;

  const existing = pendingRefresh.get(channelId);
  if (existing) clearTimeout(existing);

  pendingRefresh.set(
    channelId,
    setTimeout(() => {
      pendingRefresh.delete(channelId);
      void refreshTempChannelName(app, channelId, refreshQueue!, getChannelRenameLimiter(app));
    }, REFRESH_DEBOUNCE_MS),
  );
}

export function cancelTempChannelNameRefresh(channelId: string): void {
  const timer = pendingRefresh.get(channelId);
  if (timer) {
    clearTimeout(timer);
    pendingRefresh.delete(channelId);
  }
}

export function forgetChannelRenameHistory(channelId: string): void {
  cancelTempChannelNameRefresh(channelId);
  limiter?.forget(channelId);
}

async function runScheduledRefresh(app: AppContext, queue: DiscordTaskQueue): Promise<void> {
  if (sweepRunning) {
    app.logger.debug('Skipping channel name refresh — previous sweep still running');
    return;
  }

  sweepRunning = true;
  try {
    const stats = await runChannelNameRefresh(app, queue, getChannelRenameLimiter(app));
    if (stats.updated > 0 || stats.failed > 0) {
      app.logger.info(stats, 'Channel name refresh sweep finished');
    } else {
      app.logger.debug(stats, 'Channel name refresh sweep finished');
    }
  } finally {
    sweepRunning = false;
  }
}
