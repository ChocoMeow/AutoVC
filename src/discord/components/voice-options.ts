import type { Translator } from '@/i18n/translator.ts';

export const USER_LIMIT_OPTIONS = [null, 0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 50, 99] as const;

export const RTC_REGION_OPTIONS = [
  { label: 'Automatic', value: 'auto' },
  { label: 'US East', value: 'us-east' },
  { label: 'US West', value: 'us-west' },
  { label: 'US Central', value: 'us-central' },
  { label: 'US South', value: 'us-south' },
  { label: 'Rotterdam', value: 'rotterdam' },
  { label: 'Brazil', value: 'brazil' },
  { label: 'Hong Kong', value: 'hongkong' },
  { label: 'India', value: 'india' },
  { label: 'Japan', value: 'japan' },
  { label: 'Singapore', value: 'singapore' },
  { label: 'Sydney', value: 'sydney' },
  { label: 'South Africa', value: 'southafrica' },
] as const;

export type VoiceSelectOption = {
  label: string;
  value: string;
  default?: boolean;
};

export function userLimitOptionValue(limit: (typeof USER_LIMIT_OPTIONS)[number]): string {
  return limit === null ? 'default' : String(limit);
}

/** Discord allows one default per select — pass the matching option value. */
export function userLimitSelectOptions(t: Translator, selectedValue: string): VoiceSelectOption[] {
  return USER_LIMIT_OPTIONS.map((limit) => {
    const value = userLimitOptionValue(limit);
    return {
      label:
        limit === null
          ? t('panel.settings.limitDefault')
          : limit === 0
            ? t('panel.settings.limitNone')
            : t('panel.settings.limitUsers', { n: limit }),
      value,
      default: value === selectedValue,
    };
  });
}

export function regionSelectOptions(t: Translator, selectedValue: string): VoiceSelectOption[] {
  return RTC_REGION_OPTIONS.map((r) => ({
    label: r.value === 'auto' ? t('panel.settings.regionAuto') : r.label,
    value: r.value,
    default: r.value === selectedValue,
  }));
}

export function resolveUserLimitSelectValue(
  channelLimit: number,
  guildDefault: number | null,
  tempLimit?: number,
): string {
  if (tempLimit !== undefined) return String(tempLimit);
  if (guildDefault === null) return channelLimit === 0 ? 'default' : String(channelLimit);
  return String(channelLimit);
}

export function resolveRegionSelectValue(
  channelRegion: string | null,
  guildRtcRegion: string | null,
  tempRegion?: string | null,
): string {
  if (tempRegion !== undefined) return tempRegion ?? 'auto';
  const active = channelRegion ?? guildRtcRegion;
  if (!active || active === 'auto') return 'auto';
  return active;
}
