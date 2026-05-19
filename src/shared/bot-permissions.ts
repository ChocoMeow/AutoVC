import {
  DiscordAPIError,
  PermissionFlagsBits,
  type Guild,
  type GuildBasedChannel,
  type PermissionResolvable,
  type PermissionsBitField,
} from 'discord.js';
import { createTranslator, type Translator } from '@/i18n/translator.ts';

export interface BotPermissionRequirement {
  flag: PermissionResolvable;
  label: string;
  why: string;
}

function defaultTranslator(): Translator {
  return createTranslator('en');
}

export function buildBotGuildRequirements(t: Translator): BotPermissionRequirement[] {
  return [
    {
      flag: PermissionFlagsBits.ViewChannel,
      label: t('permissions.botReq.viewChannel.label'),
      why: t('permissions.botReq.viewChannel.why'),
    },
    {
      flag: PermissionFlagsBits.ManageChannels,
      label: t('permissions.botReq.manageChannels.label'),
      why: t('permissions.botReq.manageChannels.why'),
    },
    {
      flag: PermissionFlagsBits.MoveMembers,
      label: t('permissions.botReq.moveMembers.label'),
      why: t('permissions.botReq.moveMembers.why'),
    },
    {
      flag: PermissionFlagsBits.Connect,
      label: t('permissions.botReq.connect.label'),
      why: t('permissions.botReq.connect.why'),
    },
  ];
}

export function buildBotOverwriteRequirement(t: Translator): BotPermissionRequirement {
  return {
    flag: PermissionFlagsBits.ManageRoles,
    label: t('permissions.botReq.manageRoles.label'),
    why: t('permissions.botReq.manageRoles.why'),
  };
}

export function getBotPermissions(guild: Guild): PermissionsBitField | null {
  return guild.members.me?.permissions ?? null;
}

export function getChannelPermissions(
  guild: Guild,
  channel?: GuildBasedChannel | null,
): PermissionsBitField | null {
  const me = guild.members.me;
  if (!me) return null;
  if (channel) {
    return channel.permissionsFor(me) ?? getBotPermissions(guild);
  }
  return getBotPermissions(guild);
}

export function listMissingPermissions(
  held: PermissionsBitField | null,
  requirements: readonly BotPermissionRequirement[],
): BotPermissionRequirement[] {
  if (!held) return [...requirements];
  return requirements.filter((req) => !held.has(req.flag));
}

export function formatMissingBotPermissions(
  t: Translator,
  missing: readonly BotPermissionRequirement[],
  context?: { channelName?: string; categoryHint?: boolean },
): string {
  if (!missing.length) return '';

  const where = context?.channelName
    ? t('permissions.botWhereChannel', { channel: context.channelName })
    : context?.categoryHint
      ? t('permissions.botWhereCategory')
      : t('permissions.botWhereServer');

  const lines = missing.map((m) => `• **${m.label}** — ${m.why}`);
  return [t('permissions.botMissingHeader', { where }), '', lines.join('\n'), '', t('permissions.botMissingFooter')].join(
    '\n',
  );
}

export function checkBotGuildPermissions(
  guild: Guild,
  t: Translator = defaultTranslator(),
): { ok: true } | { ok: false; message: string } {
  const me = guild.members.me;
  if (!me) {
    return { ok: false, message: t('permissions.botNotLoaded') };
  }

  const missing = listMissingPermissions(getBotPermissions(guild), buildBotGuildRequirements(t));
  if (missing.length) {
    return { ok: false, message: formatMissingBotPermissions(t, missing) };
  }

  return { ok: true };
}

export function checkBotChannelPermissions(
  guild: Guild,
  channel: GuildBasedChannel | null | undefined,
  opts?: { needsOverwrites?: boolean },
  t: Translator = defaultTranslator(),
): { ok: true } | { ok: false; message: string } {
  const guildCheck = checkBotGuildPermissions(guild, t);
  if (!guildCheck.ok) return guildCheck;

  if (!channel) return { ok: true };

  const requirements = buildBotGuildRequirements(t);
  const held = getChannelPermissions(guild, channel);
  const channelMissing = listMissingPermissions(held, requirements);

  if (channelMissing.length) {
    return {
      ok: false,
      message: formatMissingBotPermissions(t, channelMissing, { channelName: channel.name }),
    };
  }

  if (opts?.needsOverwrites) {
    const overwriteMissing = listMissingPermissions(held, [buildBotOverwriteRequirement(t)]);
    const hasManageChannels = held?.has(PermissionFlagsBits.ManageChannels) ?? false;
    if (overwriteMissing.length && !hasManageChannels) {
      return {
        ok: false,
        message: formatMissingBotPermissions(t, overwriteMissing, {
          channelName: channel.name,
        }),
      };
    }
  }

  return { ok: true };
}

export function formatDiscordErrorForUser(
  err: unknown,
  action: string,
  t: Translator = defaultTranslator(),
): string {
  if (err instanceof DiscordAPIError) {
    if (err.code === 50013 || err.status === 403) {
      return [
        t('errors.discordDenied', { action }),
        '',
        t('errors.discordDeniedHint'),
        err.message ? `-# ${err.message}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    if (err.code === 50001) {
      return t('errors.discordNoAccess', { action });
    }

    if (err.status === 429) {
      return t('errors.discordRateLimit', { action });
    }
  }

  return t('errors.discordUnexpected', { action });
}
