import { z } from 'zod';
import { MOD_LOG_DEFAULT_TEMPLATES } from '@/domain/mod-log/types.ts';
import { GuildSettingsCoreSchema } from '@/domain/settings/guild-settings.ts';

export const ConfigDefaultsSchema = z.object({
  creator: z
    .object({
      channelName: z.string().min(1).max(100),
      userLimit: z.number().int().min(0).max(99),
      createReason: z.string().min(1).max(512),
    })
    .default({
      channelName: '➕ Join to Create',
      userLimit: 0,
      createReason: 'AutoVC creator channel',
    }),
  guild: GuildSettingsCoreSchema.default({
    channelNameTemplate: "{creator.displayName}'s Channel",
    gameFallback: 'Voice Channel',
    emojiPool: [],
    categoryId: null,
    tempCategoryId: null,
    bitrate: null,
    userLimit: null,
    rtcRegion: null,
    deleteDelayMs: 3_000,
    tempPermissionSync: 'category',
    ownerPermissions: [],
    maxChannelsPerUser: null,
    locale: 'en',
    tempChannelPosition: 'belowCreator',
    modLogChannelId: null,
    modLogWebhookId: null,
    modLogWebhookToken: null,
    modLogTemplateCreate: MOD_LOG_DEFAULT_TEMPLATES.create,
    modLogTemplateUpdate: MOD_LOG_DEFAULT_TEMPLATES.update,
    modLogTemplateDelete: MOD_LOG_DEFAULT_TEMPLATES.delete,
    modLogTemplateJoin: MOD_LOG_DEFAULT_TEMPLATES.join,
    modLogTemplateLeave: MOD_LOG_DEFAULT_TEMPLATES.leave,
    tempGreetingMessage: '',
    tempInterfaceEnabled: false,
  }),
  tempChannel: z
    .object({
      createReason: z.string().min(1).max(512),
      deleteReason: z.string().min(1).max(512),
      fallbackOwnerPermissions: z.array(z.string()).min(1),
    })
    .default({
      createReason: 'AutoVC temporary voice channel',
      deleteReason: 'AutoVC: empty temporary channel',
      fallbackOwnerPermissions: ['ManageChannels', 'MoveMembers'],
    }),
  creatorRemoveReason: z.string().min(1).max(512).default('AutoVC: creator removed'),
  naming: z
    .object({
      maxChannelNameLength: z.number().int().min(1).max(100),
    })
    .default({ maxChannelNameLength: 100 }),
});

export type ConfigDefaults = z.infer<typeof ConfigDefaultsSchema>;
