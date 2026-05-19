import { z } from 'zod';
import { isLocaleId } from '@/i18n/locales/index.ts';
import { OwnerPermissionKeySchema } from '@/domain/settings/owner-permissions.ts';
import { MOD_LOG_DEFAULT_TEMPLATES } from '@/domain/mod-log/types.ts';
import { migrateLegacyGuildSettings } from '@/domain/settings/settings-migration.ts';

export const TempPermissionSyncSchema = z.enum(['category', 'creator', 'none']);
export type TempPermissionSync = z.infer<typeof TempPermissionSyncSchema>;

export const TempChannelPositionSchema = z.enum(['top', 'belowCreator', 'bottom']);
export type TempChannelPosition = z.infer<typeof TempChannelPositionSchema>;

/** Known settings keys — add new fields here when you ship new features. */
export const GuildSettingsCoreSchema = z.object({
  /** Bot UI language for this server (see src/i18n/locales/index.ts). */
  locale: z.string().default('en'),
  channelNameTemplate: z.string().default("{creator.displayName}'s Channel"),
  gameFallback: z.string().default('Voice Channel'),
  emojiPool: z.array(z.string()).default([]),
  /** Category for new creator (join-to-create) channels. */
  categoryId: z.string().nullable().default(null),
  /** Category for new temporary voice channels (falls back to categoryId, then creator parent). */
  tempCategoryId: z.string().nullable().default(null),
  bitrate: z.number().int().min(8).max(384).nullable().default(null),
  userLimit: z.number().int().min(0).max(99).nullable().default(null),
  rtcRegion: z.string().nullable().default(null),
  deleteDelayMs: z.number().int().min(0).max(30_000).default(3_000),
  /** How temp channel permission overwrites are initialized. */
  tempPermissionSync: TempPermissionSyncSchema.default('category'),
  /** Owner permission flags (empty = use config fallback list). */
  ownerPermissions: z.array(OwnerPermissionKeySchema).default([]),
  maxChannelsPerUser: z.number().int().min(1).max(10).nullable().default(null),
  /** Where new temp voice channels are placed in the channel list. */
  tempChannelPosition: TempChannelPositionSchema.default('belowCreator'),
  /** Text channel for moderation logs (null = disabled). */
  modLogChannelId: z.string().nullable().default(null),
  /** Channel webhook used for log delivery (managed automatically). */
  modLogWebhookId: z.string().nullable().default(null),
  modLogWebhookToken: z.string().nullable().default(null),
  modLogTemplateCreate: z.string().min(1).max(2000).default(MOD_LOG_DEFAULT_TEMPLATES.create),
  modLogTemplateUpdate: z.string().min(1).max(2000).default(MOD_LOG_DEFAULT_TEMPLATES.update),
  modLogTemplateDelete: z.string().min(1).max(2000).default(MOD_LOG_DEFAULT_TEMPLATES.delete),
  modLogTemplateJoin: z.string().min(1).max(2000).default(MOD_LOG_DEFAULT_TEMPLATES.join),
  modLogTemplateLeave: z.string().min(1).max(2000).default(MOD_LOG_DEFAULT_TEMPLATES.leave),
  /** Voice-chat greeting when a temp channel is created; empty string disables it. */
  tempGreetingMessage: z.string().max(2000).default(''),
  /** Post an interactive control panel in the temp channel voice chat. */
  tempInterfaceEnabled: z.boolean().default(false),
});

/**
 * Parses known settings with defaults; preserves unknown JSON keys from DB
 * so future dashboard/API fields survive round-trips.
 */
export const GuildSettingsSchema = GuildSettingsCoreSchema.passthrough();

export type GuildSettings = z.infer<typeof GuildSettingsCoreSchema>;
export type GuildSettingsRecord = z.infer<typeof GuildSettingsSchema>;

export function parseGuildSettings(
  raw: unknown,
  baseDefaults: GuildSettingsRecord,
): GuildSettingsRecord {
  const stored =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  migrateLegacyGuildSettings(stored);
  const parsed = GuildSettingsSchema.parse({ ...baseDefaults, ...stored });
  if (typeof parsed.locale === 'string' && !isLocaleId(parsed.locale)) {
    parsed.locale = isLocaleId(baseDefaults.locale) ? baseDefaults.locale : 'en';
  }
  return parsed;
}

export function parseGuildSettingsPatch(raw: unknown): Partial<GuildSettingsRecord> {
  const stored =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return GuildSettingsSchema.partial().passthrough().parse(stored);
}
