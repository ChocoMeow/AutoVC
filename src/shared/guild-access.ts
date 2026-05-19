import {
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { getAppContext } from '@/app-context.ts';
import {
  permissionDeniedEditPayload,
  permissionDeniedPayload,
} from '@/discord/components/panel-primitives.ts';
import { createTranslator } from '@/i18n/translator.ts';
import { resolveGuildLocale } from '@/i18n/resolve-locale.ts';
import { checkBotGuildPermissions } from '@/shared/bot-permissions.ts';

export type GuildManageInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

async function resolveGuildMember(
  interaction: GuildManageInteraction,
): Promise<GuildMember | null> {
  const guild = interaction.guild;
  if (!guild) return null;

  const cached = guild.members.cache.get(interaction.user.id);
  if (cached) return cached;

  try {
    return await guild.members.fetch(interaction.user.id);
  } catch {
    return null;
  }
}

function translatorFor(interaction: GuildManageInteraction) {
  const app = getAppContext();
  const settings = interaction.guild
    ? app.guildCache.get(interaction.guild.id)
    : undefined;
  const locale = resolveGuildLocale(settings, app.config.defaults.guild.locale);
  return createTranslator(locale);
}

async function replyEphemeral(
  interaction: GuildManageInteraction,
  body: string,
): Promise<void> {
  const t = translatorFor(interaction);
  const title = t('permissions.title');
  if (interaction.deferred || interaction.replied) {
    await interaction
      .editReply(permissionDeniedEditPayload(title, body))
      .catch(() => undefined);
    return;
  }

  await interaction.reply(permissionDeniedPayload(title, body)).catch(() => undefined);
}

/** Ensures the invoking user can manage the server and the bot has required guild permissions. */
export async function requireManageGuild(
  interaction: GuildManageInteraction,
): Promise<GuildMember | null> {
  const t = translatorFor(interaction);

  if (!interaction.inGuild() || !interaction.guild) {
    await replyEphemeral(interaction, t('permissions.userNotInGuild'));
    return null;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await replyEphemeral(interaction, t('permissions.userManageGuild'));
    return null;
  }

  const guildMember = await resolveGuildMember(interaction);
  if (!guildMember) {
    await replyEphemeral(interaction, t('permissions.userMembership'));
    return null;
  }

  const botCheck = checkBotGuildPermissions(interaction.guild, t);
  if (!botCheck.ok) {
    await replyEphemeral(interaction, botCheck.message);
    return null;
  }

  return guildMember;
}
