import type { AppContext } from '@/app-context.ts';

export interface TempChannelSettings {
  /** Owner-chosen name; blocks automatic template renames while set. */
  customName?: string;
  userLimit?: number;
  rtcRegion?: string | null;
}

export function parseTempChannelSettings(raw: unknown): TempChannelSettings {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};

  const o = raw as Record<string, unknown>;
  const settings: TempChannelSettings = {};

  if (typeof o.customName === 'string') {
    const name = o.customName.trim();
    if (name) settings.customName = name.slice(0, 100);
  }
  if (typeof o.userLimit === 'number' && Number.isInteger(o.userLimit)) {
    settings.userLimit = o.userLimit;
  }
  if (o.rtcRegion === null) {
    settings.rtcRegion = null;
  } else if (typeof o.rtcRegion === 'string') {
    settings.rtcRegion = o.rtcRegion;
  }

  return settings;
}

export function tempChannelNameLocked(settings: TempChannelSettings | undefined): boolean {
  return Boolean(settings?.customName);
}

export async function patchTempChannelSettings(
  app: AppContext,
  channelId: string,
  patch: Partial<TempChannelSettings>,
): Promise<void> {
  const meta = app.tempRegistry.get(channelId);
  if (!meta) return;

  const settings: TempChannelSettings = { ...(meta.settings ?? {}), ...patch };
  app.tempRegistry.setSettings(channelId, settings);

  await app.tempRepo.updateSettings(channelId, settings).catch((err) => {
    app.logger.warn({ err, channelId }, 'Failed to persist temp channel settings');
  });
}
