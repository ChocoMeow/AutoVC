import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type VoiceChannel,
} from 'discord.js';
import { getAppContext } from '@/app-context.ts';
import type { AppContext } from '@/app-context.ts';
import { mergeSettings } from '@/domain/settings/settings-merger.ts';
import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';
import { buildChannelTemplateContext } from '@/domain/naming/build-template-context.ts';
import { patchTempChannelSettings } from '@/domain/temp-channel-settings.ts';
import { editTempInterfaceMessage } from '@/discord/components/temp-voice-panel.ts';
import {
  isTempVoiceInteractionId,
  parseTempVcButton,
  parseTempVcChannelId,
  parseTempVcMemberSelectValue,
  parseTempVcModalRename,
  parseTempVcSelectKind,
  TempVcId,
} from '@/discord/components/temp-voice-ids.ts';
import { EPHEMERAL_DEFER_FLAGS, EPHEMERAL_FLAGS } from '@/discord/components/ui-flags.ts';
import type { TempChannelMeta } from '@/infra/cache/temp-channel-registry.ts';
import { guildTranslator } from '@/i18n/guild-translator.ts';
import type { Translator } from '@/i18n/translator.ts';

type TempInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

interface TempContext {
  app: AppContext;
  meta: TempChannelMeta;
  channel: VoiceChannel;
  settings: GuildSettingsRecord;
  t: Translator;
}

export async function handleTempVoiceInteraction(interaction: TempInteraction): Promise<void> {
  if (!interaction.inGuild() || !isTempVoiceInteractionId(interaction.customId)) return;

  const channelId = parseTempVcChannelId(interaction.customId);
  if (!channelId) return;

  const app = getAppContext();
  const ctx = await resolveTempContext(interaction, app, channelId);
  if (!ctx) return;

  if (interaction.isButton()) {
    await handleButton(interaction, ctx);
  } else if (interaction.isStringSelectMenu()) {
    await handleSelect(interaction, ctx);
  } else if (interaction.isModalSubmit()) {
    await handleModal(interaction, ctx);
  }
}

async function resolveTempContext(
  interaction: TempInteraction,
  app: AppContext,
  channelId: string,
): Promise<TempContext | null> {
  const meta = app.tempRegistry.get(channelId);
  const t = guildTranslator(app, interaction.guild?.id ?? meta?.guildId ?? '');

  if (!meta) {
    await interaction.reply({ content: t('tempInterface.gone'), flags: EPHEMERAL_FLAGS });
    return null;
  }

  if (interaction.user.id !== meta.ownerId) {
    await interaction.reply({ content: t('tempInterface.notOwner'), flags: EPHEMERAL_FLAGS });
    return null;
  }

  const guild = interaction.guild!;
  const actor = guild.members.cache.get(interaction.user.id)
    ?? (await guild.members.fetch(interaction.user.id).catch(() => null));
  if (!actor?.voice.channelId || actor.voice.channelId !== channelId) {
    await interaction.reply({ content: t('tempInterface.notInChannel'), flags: EPHEMERAL_FLAGS });
    return null;
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    await interaction.reply({ content: t('tempInterface.gone'), flags: EPHEMERAL_FLAGS });
    return null;
  }

  const creator = app.creatorIndex.get(meta.creatorChannelId);
  const guildSettings =
    (await app.guildCache.load(meta.guildId)) ?? app.guildCache.get(meta.guildId);
  if (!guildSettings || !creator) return null;

  return {
    app,
    meta,
    channel,
    settings: mergeSettings(guildSettings, creator.settings, app.config.defaults.guild),
    t: guildTranslator(app, meta.guildId, guildSettings),
  };
}

async function handleButton(interaction: ButtonInteraction, ctx: TempContext): Promise<void> {
  const parsed = parseTempVcButton(interaction.customId);
  if (!parsed) return;

  switch (parsed.action) {
    case 'rename':
      await interaction.showModal(renameModal(ctx.channel, ctx.settings, ctx.t));
      return;
    case 'delete':
      await interaction.reply({
        content: ctx.t('tempInterface.deleteConfirm'),
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(TempVcId.button(ctx.channel.id, 'delete_confirm'))
              .setLabel(ctx.t('tempInterface.deleteConfirmBtn'))
              .setStyle(ButtonStyle.Danger),
          ),
        ],
        flags: EPHEMERAL_FLAGS,
      });
      return;
    case 'delete_confirm':
      await interaction.deferUpdate();
      await ctx.app.voiceService.deleteTempChannel(ctx.channel.id, ctx.meta.guildId);
      return;
    case 'refresh':
      await interaction.deferUpdate();
      await editTempInterfaceMessage(ctx.app, ctx.channel, ctx.settings, ctx.t);
      return;
  }
}

async function handleSelect(
  interaction: StringSelectMenuInteraction,
  ctx: TempContext,
): Promise<void> {
  const parsed = parseTempVcSelectKind(interaction.customId);
  const value = interaction.values[0];
  if (!parsed || !value) return;

  await interaction.deferReply({ flags: EPHEMERAL_DEFER_FLAGS });

  let refreshPanel = true;

  switch (parsed.kind) {
    case 'limit': {
      const limit = value === 'default' ? (ctx.settings.userLimit ?? 0) : Number(value);
      await ctx.channel.setUserLimit(limit, 'AutoVC: user limit');
      await patchTempChannelSettings(ctx.app, ctx.channel.id, { userLimit: limit });
      await interaction.editReply({ content: ctx.t('tempInterface.limitUpdated') });
      break;
    }
    case 'region': {
      const region = value === 'auto' ? null : value;
      await ctx.channel.setRTCRegion(region, 'AutoVC: voice region');
      await patchTempChannelSettings(ctx.app, ctx.channel.id, { rtcRegion: region });
      await interaction.editReply({ content: ctx.t('tempInterface.regionUpdated') });
      break;
    }
    case 'member': {
      const action = parseTempVcMemberSelectValue(value);
      if (!action) return;

      if (action.action === 'transfer') {
        refreshPanel = false;
        if (action.userId === ctx.meta.ownerId) {
          await interaction.editReply({ content: ctx.t('tempInterface.alreadyOwner') });
          return;
        }
        const ok = await ctx.app.voiceService.transferTempOwnershipTo(ctx.channel, action.userId);
        await interaction.editReply({
          content: ok ? ctx.t('tempInterface.transferred') : ctx.t('tempInterface.transferFailed'),
        });
        if (ok) await editTempInterfaceMessage(ctx.app, ctx.channel, ctx.settings, ctx.t);
        return;
      }

      const member = await ctx.channel.guild.members.fetch(action.userId).catch(() => null);
      if (action.action === 'kick') {
        if (member?.voice.channelId === ctx.channel.id) {
          await member.voice.disconnect('AutoVC: kicked by owner');
        }
        await interaction.editReply({ content: ctx.t('tempInterface.kicked') });
      } else {
        await ctx.channel.permissionOverwrites.edit(action.userId, { Connect: false, Speak: false });
        if (member?.voice.channelId === ctx.channel.id) {
          await member.voice.disconnect('AutoVC: blocked by owner');
        }
        await interaction.editReply({ content: ctx.t('tempInterface.blocked') });
      }
      break;
    }
  }

  if (refreshPanel) {
    await editTempInterfaceMessage(ctx.app, ctx.channel, ctx.settings, ctx.t);
  }
}

async function handleModal(interaction: ModalSubmitInteraction, ctx: TempContext): Promise<void> {
  const renameChannelId = parseTempVcModalRename(interaction.customId);
  if (!renameChannelId || renameChannelId !== ctx.channel.id) return;

  const template = interaction.fields.getTextInputValue('name').trim();
  if (!template) {
    await interaction.reply({ content: ctx.t('tempInterface.renameEmpty'), flags: EPHEMERAL_FLAGS });
    return;
  }

  const creator = ctx.app.creatorIndex.get(ctx.meta.creatorChannelId);
  let name = template;
  if (creator) {
    const namingCtx = await buildChannelTemplateContext(
      ctx.app,
      ctx.meta,
      ctx.channel,
      creator,
      { forNewChannel: false },
    );
    if (namingCtx) {
      name = (await ctx.app.templateEngine.render(template, namingCtx)).trim();
    }
  }
  if (!name) {
    await interaction.reply({ content: ctx.t('tempInterface.renameEmpty'), flags: EPHEMERAL_FLAGS });
    return;
  }

  await interaction.deferReply({ flags: EPHEMERAL_DEFER_FLAGS });
  await ctx.channel.setName(name, ctx.app.config.channelNameRefresh.renameReason);
  await patchTempChannelSettings(ctx.app, ctx.channel.id, { customName: name });
  await interaction.editReply({ content: ctx.t('tempInterface.renamed') });
  await editTempInterfaceMessage(ctx.app, ctx.channel, ctx.settings, ctx.t);
}

function renameModal(
  channel: VoiceChannel,
  settings: GuildSettingsRecord,
  t: Translator,
): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId('name')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(100)
    .setValue(channel.name.slice(0, 100))
    .setRequired(true);

  const templateHint = settings.channelNameTemplate.trim();
  if (templateHint) {
    input.setPlaceholder(templateHint.slice(0, 100));
  }

  return new ModalBuilder()
    .setCustomId(TempVcId.modalRename(channel.id))
    .setTitle(t('tempInterface.modalRenameTitle'))
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(t('tempInterface.modalRenameLabel'))
        .setDescription(t('tempInterface.modalRenameHint'))
        .setTextInputComponent(input),
    );
}
