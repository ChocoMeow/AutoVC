/** Discord enforces ~2 channel renames per 10 minutes per channel (undocumented sublimit). */
export class ChannelRenameLimiter {
  private readonly history = new Map<string, number[]>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
  ) {}

  canRename(channelId: string, now = Date.now()): boolean {
    return this.prune(channelId, now).length < this.maxPerWindow;
  }

  recordRename(channelId: string, now = Date.now()): void {
    const times = this.prune(channelId, now);
    times.push(now);
    this.history.set(channelId, times);
  }

  msUntilCanRename(channelId: string, now = Date.now()): number {
    const times = this.prune(channelId, now);
    if (times.length < this.maxPerWindow) return 0;
    const oldest = times[0]!;
    return Math.max(0, oldest + this.windowMs - now);
  }

  forget(channelId: string): void {
    this.history.delete(channelId);
  }

  private prune(channelId: string, now: number): number[] {
    const cutoff = now - this.windowMs;
    const times = (this.history.get(channelId) ?? []).filter((t) => t > cutoff);
    if (times.length) this.history.set(channelId, times);
    else this.history.delete(channelId);
    return times;
  }
}
