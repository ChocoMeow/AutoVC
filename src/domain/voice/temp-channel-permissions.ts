import {
  OverwriteType,
  PermissionFlagsBits,
  type GuildMember,
  type OverwriteResolvable,
  type PermissionOverwriteOptions,
  type VoiceBasedChannel,
  type VoiceChannel,
} from 'discord.js';
import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';
import type { OwnerPermissionKey } from '@/domain/settings/owner-permissions.ts';
import type { Translator } from '@/i18n/translator.ts';
import type { MessageKey } from '@/i18n/types.ts';
import { resolvePermissionFlags } from '@/shared/permission-flags.ts';

export function resolveOwnerPermissionNames(
  settings: GuildSettingsRecord,
  fallback: readonly string[],
): readonly string[] {
  return settings.ownerPermissions.length > 0 ? settings.ownerPermissions : fallback;
}

export function formatOwnerPermissionLabels(
  settings: GuildSettingsRecord,
  fallback: readonly string[],
  t: Translator,
): string {
  const keys = resolveOwnerPermissionNames(settings, fallback);
  if (!keys.length) return t('ownerPermissions.none');
  return keys
    .map((k) => t(`ownerPermissions.${k}` as MessageKey) ?? k)
    .join(', ');
}

export function resolveOwnerPermissionBits(
  settings: GuildSettingsRecord,
  fallback: readonly string[],
): bigint {
  return resolvePermissionFlags(resolveOwnerPermissionNames(settings, fallback));
}

export function resolveOwnerOverwriteOptions(
  settings: GuildSettingsRecord,
  fallback: readonly string[],
): PermissionOverwriteOptions {
  const options: PermissionOverwriteOptions = {};
  for (const key of resolveOwnerPermissionNames(settings, fallback)) {
    if (key in PermissionFlagsBits) {
      options[key as keyof typeof PermissionFlagsBits] = true;
    }
  }
  return options;
}

export function copyChannelOverwrites(
  channel: VoiceBasedChannel,
): OverwriteResolvable[] {
  return [...channel.permissionOverwrites.cache.values()].map((ow) => ({
    id: ow.id,
    type: ow.type,
    allow: ow.allow.bitfield,
    deny: ow.deny.bitfield,
  }));
}

function withOwnerOverwrite(
  overwrites: OverwriteResolvable[],
  memberId: string,
  allow: bigint,
): OverwriteResolvable[] {
  const next = overwrites.filter((ow) => ow.id !== memberId);
  next.push({
    id: memberId,
    type: OverwriteType.Member,
    allow,
    deny: 0n,
  });
  return next;
}

export function buildCreateOverwrites(
  settings: GuildSettingsRecord,
  member: GuildMember,
  creatorChannel: VoiceBasedChannel,
  fallbackOwnerPermissions: readonly string[],
): OverwriteResolvable[] | undefined {
  const ownerBits = resolveOwnerPermissionBits(settings, fallbackOwnerPermissions);

  switch (settings.tempPermissionSync) {
    case 'creator':
      return withOwnerOverwrite(copyChannelOverwrites(creatorChannel), member.id, ownerBits);
    case 'none':
      return [
        {
          id: member.id,
          type: OverwriteType.Member,
          allow: ownerBits,
        },
      ];
    case 'category':
      return undefined;
  }
}

export async function applyTempChannelPermissions(
  tempChannel: VoiceChannel,
  settings: GuildSettingsRecord,
  member: GuildMember,
  parentId: string | undefined,
  fallbackOwnerPermissions: readonly string[],
): Promise<void> {
  const ownerOptions = resolveOwnerOverwriteOptions(settings, fallbackOwnerPermissions);

  if (settings.tempPermissionSync === 'category' && parentId) {
    await tempChannel.lockPermissions().catch(() => undefined);
  }

  await tempChannel.permissionOverwrites.edit(member, ownerOptions).catch(() => undefined);
}
