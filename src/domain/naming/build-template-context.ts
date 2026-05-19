import type { Guild, GuildBasedChannel, GuildMember, VoiceBasedChannel } from 'discord.js';
import type { AppContext } from '@/app-context.ts';
import type { CreatorConfig } from '@/infra/cache/creator-channel-index.ts';
import type { TempChannelMeta } from '@/infra/cache/temp-channel-registry.ts';
import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';
import { mergeSettings } from '@/domain/settings/settings-merger.ts';
import type { ModLogChannelKind } from '@/domain/mod-log/channel-kind.ts';
import type { ModLogEvent } from '@/domain/mod-log/types.ts';
import type { TemplateContext } from '@/domain/naming/template-context.ts';

async function resolveOwnerMember(
  guild: Guild,
  channel: VoiceBasedChannel,
  ownerId: string,
  template: string,
): Promise<GuildMember | null> {
  let member =
    guild.members.cache.get(ownerId) ?? channel.members.get(ownerId) ?? null;

  const needsHoistRole = template.includes('{creator.hoistRole}');
  const needsFetch =
    !member ||
    (needsHoistRole && (member.partial || member.roles.cache.size <= 1));

  if (!needsFetch) return member;

  return guild.members.fetch({ user: ownerId, force: true }).catch(() => member);
}

/** Context for channel name templates, greetings, and rename modals. */
export async function buildChannelTemplateContext(
  app: AppContext,
  meta: TempChannelMeta,
  channel: VoiceBasedChannel,
  creator: CreatorConfig,
  opts: { forNewChannel: boolean },
): Promise<TemplateContext | null> {
  const { guildCache, guildConfigRepo, tempRegistry } = app;
  const guild = channel.guild as Guild;

  let guildSettings = guildCache.get(meta.guildId);
  if (!guildSettings) {
    const row = await guildConfigRepo.findById(meta.guildId);
    if (!row?.enabled) return null;
    guildSettings = row.settings;
    guildCache.set(meta.guildId, guildSettings);
  }

  const settings = mergeSettings(
    guildSettings,
    creator.settings,
    app.config.defaults.guild,
  );

  const creatorChannel = guild.channels.cache.get(creator.channelId);
  if (!creatorChannel?.isVoiceBased()) return null;

  const member = await resolveOwnerMember(
    guild,
    channel,
    meta.ownerId,
    settings.channelNameTemplate,
  );
  if (!member) return null;

  const creatorCount = tempRegistry.countByCreator(meta.guildId, meta.creatorChannelId);
  const ownerCount = tempRegistry.countByOwner(meta.guildId, meta.ownerId);

  return {
    profile: 'channel',
    guild,
    settings,
    member,
    channel,
    creatorChannel,
    memberCountInNewChannel: opts.forNewChannel ? 1 : channel.members.size,
    tempChannelOrdinal: opts.forNewChannel ? creatorCount + 1 : creatorCount,
    ownerTempOrdinal: opts.forNewChannel ? ownerCount + 1 : ownerCount,
  };
}

export interface ModLogTemplateInput {
  guild: Guild;
  channel: GuildBasedChannel;
  channelKind: ModLogChannelKind;
  user?: GuildMember | null;
  creatorChannelId?: string;
  oldName?: string;
  newName?: string;
}

/** Context for moderation log message templates. */
export function buildModLogTemplateContext(
  settings: GuildSettingsRecord,
  event: ModLogEvent,
  input: ModLogTemplateInput,
): TemplateContext {
  return {
    profile: 'message',
    guild: input.guild,
    settings,
    member: input.user,
    modLog: {
      event,
      channel: input.channel,
      channelKind: input.channelKind,
      user: input.user,
      creatorChannelId: input.creatorChannelId,
      oldName: input.oldName,
      newName: input.newName,
    },
  };
}
