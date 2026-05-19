import type { Guild, GuildBasedChannel, GuildMember } from 'discord.js';
import type { ModLogEvent } from '@/domain/mod-log/types.ts';
import type { TemplateContext } from '@/domain/naming/template-context.ts';

export function getGuild(ctx: TemplateContext): Guild {
  return ctx.guild;
}

export function getMember(ctx: TemplateContext): GuildMember | null {
  if (ctx.member) return ctx.member;
  return ctx.modLog?.user ?? null;
}

export function getTempChannel(ctx: TemplateContext): GuildBasedChannel | null {
  if (ctx.channel) return ctx.channel;
  return ctx.modLog?.channel ?? null;
}

export function getCreatorChannel(ctx: TemplateContext): GuildBasedChannel | null {
  if (ctx.creatorChannel) return ctx.creatorChannel;

  const mod = ctx.modLog;
  if (!mod) return null;

  const id =
    mod.creatorChannelId ?? (mod.channelKind === 'creator' ? mod.channel.id : undefined);
  if (!id) return null;

  return ctx.guild.channels.cache.get(id) ?? null;
}

export function channelFieldValue(
  channel: GuildBasedChannel,
  field: string,
  nameOverride?: string,
): string {
  const name = nameOverride ?? channel.name;
  switch (field) {
    case 'name':
      return name;
    case 'id':
      return channel.id;
    case 'mention':
      return `#${name}`;
    case 'members_count':
    case 'member_count':
    case 'members':
      return channel.isVoiceBased() ? String(channel.members.size) : '';
    default:
      return '';
  }
}

export function modLogChannelSide(
  side: 'old' | 'new',
  event: ModLogEvent,
  ctx: TemplateContext,
  field: string,
): string {
  const mod = ctx.modLog;
  if (!mod) return '';

  const { channel } = mod;

  switch (event) {
    case 'create':
      return side === 'new' ? channelFieldValue(channel, field) : '';
    case 'delete':
      return side === 'old' ? channelFieldValue(channel, field) : '';
    case 'update':
      if (side === 'old') return channelFieldValue(channel, field, mod.oldName);
      return channelFieldValue(channel, field, mod.newName ?? channel.name);
    case 'join':
      return side === 'new' ? channelFieldValue(channel, field) : '';
    case 'leave':
      return side === 'old' ? channelFieldValue(channel, field) : '';
  }
}
