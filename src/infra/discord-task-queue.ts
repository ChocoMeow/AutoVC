import { RateLimitError } from '@discordjs/rest';
import { DiscordAPIError } from 'discord.js';
import type { Logger } from '@/shared/logger.ts';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function retryAfterMs(err: unknown): number {
  if (err instanceof RateLimitError) {
    return Math.ceil(err.retryAfter * 1000) + 250;
  }
  if (err instanceof DiscordAPIError && err.status === 429) {
    const raw = err.rawError as { retry_after?: number };
    if (typeof raw?.retry_after === 'number') {
      return Math.ceil(raw.retry_after * 1000) + 250;
    }
  }
  return 5_000;
}

type Task = {
  label: string;
  fn: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
  attempts: number;
};

/**
 * Serializes Discord REST-heavy work with spacing and 429 backoff
 * so startup recovery does not burst the API.
 */
export class DiscordTaskQueue {
  private readonly queue: Task[] = [];
  private draining = false;

  constructor(
    private readonly minDelayMs: number,
    private readonly logger: Logger,
    private readonly maxRetries: number,
  ) {}

  enqueue(label: string, fn: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ label, fn, resolve, reject, attempts: 0 });
      void this.drain();
    });
  }

  get pending(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    let lastFinished = 0;

    while (this.queue.length > 0) {
      const elapsed = Date.now() - lastFinished;
      if (elapsed < this.minDelayMs) {
        await sleep(this.minDelayMs - elapsed);
      }

      const task = this.queue.shift()!;
      try {
        await task.fn();
        task.resolve();
      } catch (err) {
        if (this.isRateLimit(err) && task.attempts < this.maxRetries) {
          const wait = retryAfterMs(err);
          task.attempts++;
          this.logger.warn(
            { label: task.label, waitMs: wait, attempt: task.attempts },
            'Discord rate limit — re-queuing task',
          );
          await sleep(wait);
          this.queue.unshift(task);
          continue;
        }

        this.logger.error({ err, label: task.label }, 'Discord task failed');
        task.reject(err);
      }

      lastFinished = Date.now();
    }

    this.draining = false;
  }

  private isRateLimit(err: unknown): boolean {
    return err instanceof RateLimitError || (err instanceof DiscordAPIError && err.status === 429);
  }
}
