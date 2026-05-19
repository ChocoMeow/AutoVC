import type { StringSelectMenuInteraction } from 'discord.js';
import {
  GuildSettingsCoreSchema,
  TempChannelPositionSchema,
  TempPermissionSyncSchema,
  type GuildSettings,
} from '@/domain/settings/guild-settings.ts';
import { OwnerPermissionKeySchema } from '@/domain/settings/owner-permissions.ts';
import { isLocaleId } from '@/i18n/locales/index.ts';
import { SETTING_SELECT_KINDS } from '@/discord/components/custom-ids.ts';

function validateSettingsValue<K extends keyof GuildSettings>(
  key: K,
  value: unknown,
): GuildSettings[K] {
  return GuildSettingsCoreSchema.shape[key].parse(value) as GuildSettings[K];
}

export function buildSettingsPatchFromSelect(
  kind: (typeof SETTING_SELECT_KINDS)[number],
  interaction: StringSelectMenuInteraction,
): Partial<GuildSettings> {
  const value = interaction.values[0];

  switch (kind) {
    case 'ss':
      return { tempPermissionSync: TempPermissionSyncSchema.parse(value) };
    case 'so':
      return { ownerPermissions: OwnerPermissionKeySchema.array().parse(interaction.values) };
    case 'sd':
      return { deleteDelayMs: GuildSettingsCoreSchema.shape.deleteDelayMs.parse(Number(value)) };
    case 'br':
      return {
        bitrate: validateSettingsValue(
          'bitrate',
          value === 'default' ? null : Number(value),
        ),
      };
    case 'ul':
      return {
        userLimit: validateSettingsValue(
          'userLimit',
          value === 'default' ? null : Number(value),
        ),
      };
    case 'rg':
      return {
        rtcRegion: validateSettingsValue('rtcRegion', value === 'auto' ? null : value),
      };
    case 'mc':
      return {
        maxChannelsPerUser: validateSettingsValue(
          'maxChannelsPerUser',
          value === 'default' ? null : Number(value),
        ),
      };
    case 'tp':
      return { tempChannelPosition: TempChannelPositionSchema.parse(value) };
    case 'tc':
      return { tempCategoryId: value === 'default' ? null : value };
    case 'ie':
      return { tempInterfaceEnabled: value === 'on' };
    case 'ml':
      return { modLogChannelId: value === 'disabled' ? null : value };
    case 'ln': {
      const locale = value ?? interaction.values[0];
      if (!locale || !isLocaleId(locale)) return {};
      return { locale };
    }
    default:
      return {};
  }
}
