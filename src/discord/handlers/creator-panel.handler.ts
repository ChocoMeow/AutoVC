import {
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { getAppContext } from '@/app-context.ts';
import type { AppContext } from '@/app-context.ts';
import {
  createCreatorVoiceChannel,
  ensureGuildConfigured,
} from '@/domain/creator/creator-setup.service.ts';
import type { GuildSettings, GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';
import { mergeSettings } from '@/domain/settings/settings-merger.ts';
import {
  CustomId,
  isAutoVcCustomId,
  parseEditGreetingScopeKey,
  parseEditModLogEvent,
  parseEditTemplateChannelId,
  parseModalGreetingScopeKey,
  parseModalModLogEvent,
  parseModalTemplateChannelId,
  parseRemoveDoId,
  SETTING_SELECT_KINDS,
} from '@/discord/components/custom-ids.ts';
import {
  modLogTemplatePatch,
  modLogTemplateValue,
  type ModLogEvent,
} from '@/domain/mod-log/types.ts';
import type { MessageKey } from '@/i18n/types.ts';
import { replyPanelPayload } from '@/discord/components/panel-reply.ts';
import {
  parseScopedSelectId,
  type SettingsScope,
} from '@/discord/components/settings-scope.ts';
import {
  parseSettingsPageId,
  subpageForSelectKind,
  type SettingsSubpage,
} from '@/discord/components/settings-pages.ts';
import {
  creatorSettingsPanel,
  guildSettingsPanel,
  listPanel,
  mainPanel,
  mainPanelEdit,
  messagePanelEdit,
  messagePanelReply,
  removeConfirmPanel,
  removePanel,
  settingsHomePanel,
} from '@/discord/components/creator-ui.ts';
import { guildTranslator } from '@/i18n/guild-translator.ts';
import type { Translator } from '@/i18n/translator.ts';
import {
  checkBotChannelPermissions,
  formatDiscordErrorForUser,
} from '@/shared/bot-permissions.ts';
import { requireManageGuild } from '@/shared/guild-access.ts';
import { syncModLogWebhook } from '@/domain/mod-log/mod-log-webhook.ts';
import { buildSettingsPatchFromSelect } from '@/shared/settings-panel-patch.ts';
async function guard(
  interaction: ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction,
): Promise<boolean> {
  return Boolean(await requireManageGuild(interaction));
}

export async function handleCreatorPanelInteraction(
  interaction:
    | ButtonInteraction
    | StringSelectMenuInteraction
    | ModalSubmitInteraction,
): Promise<void> {
  if (!interaction.inGuild() || !isAutoVcCustomId(interaction.customId)) return;
  if (!(await guard(interaction))) return;

  const app = getAppContext();
  const guild = interaction.guild!;
  const guildId = guild.id;
  const fallbackOwner = app.config.defaults.tempChannel.fallbackOwnerPermissions;

  try {
    if (interaction.isButton()) {
      await handleButton(interaction, app, guild, guildId, fallbackOwner);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      await handleSelect(interaction, app, guild, guildId, fallbackOwner);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModal(interaction, guildId);
    }
  } catch (err) {
    const t = guildTranslator(app, guildId);
    app.logger.error({ err, customId: interaction.customId }, 'Creator panel interaction failed');
    await replyPanelPayload(
      interaction,
      messagePanelEdit(
        t,
        t('errors.panelTitle'),
        `${formatDiscordErrorForUser(err, describePanelAction(t, interaction.customId), t)}\n\n-# ${t('errors.panelReopen')}`,
      ),
    );
  }
}

function describePanelAction(t: Translator, customId: string): string {
  if (customId === CustomId.create) return t('errors.actionCreate');
  if (parseRemoveDoId(customId)) return t('errors.actionRemove');
  if (parseModalTemplateChannelId(customId) !== undefined) return t('errors.actionTemplate');
  return t('errors.actionGeneric');
}

async function handleButton(
  interaction: ButtonInteraction,
  app: AppContext,
  guild: NonNullable<ButtonInteraction['guild']>,
  guildId: string,
  fallbackOwner: readonly string[],
): Promise<void> {
  const { creatorRepo, creatorIndex, guildCache, guildConfigRepo } = app;
  const id = interaction.customId;

  if (id === CustomId.main) {
    const t = guildTranslator(app, guildId);
    await interaction.update(mainPanelEdit(t));
    return;
  }

  if (id === CustomId.create) {
    await interaction.deferUpdate();
    const guildRow = await ensureGuildConfigured(app, guildId);
    const t = guildTranslator(app, guildId, guildRow.settings);

    const parentId = guildRow.settings.categoryId ?? undefined;
    const parent = parentId ? guild.channels.cache.get(parentId) : null;
    const channelCheck = checkBotChannelPermissions(
      guild,
      parent ?? null,
      { needsOverwrites: guildRow.settings.tempPermissionSync === 'category' && Boolean(parentId) },
      t,
    );
    if (!channelCheck.ok) {
      await interaction.editReply(messagePanelEdit(t, t('panel.botPermsTitle'), channelCheck.message));
      return;
    }

    const voiceChannel = await createCreatorVoiceChannel(app, guild, guildRow.settings);
    const row = await creatorRepo.add(guildId, voiceChannel.id);
    creatorIndex.register(row);
    guildCache.set(guildId, guildRow.settings);

    const actor = await guild.members.fetch(interaction.user.id).catch(() => null);
    app.modLogService.logCreate(
      guildId,
      guildRow.settings,
      voiceChannel,
      'creator',
      actor,
    );
    await interaction.editReply(
      messagePanelEdit(
        t,
        t('panel.create.title'),
        t('panel.create.body', { name: voiceChannel.name }),
      ),
    );
    return;
  }

  const t = guildTranslator(app, guildId);

  if (id === CustomId.removeMenu) {
    await interaction.update(removePanel(t, guild, creatorIndex.listByGuild(guildId)));
    return;
  }

  if (id === CustomId.list) {
    await interaction.update(listPanel(t, guild, creatorIndex.listByGuild(guildId)));
    return;
  }

  if (id === CustomId.settings) {
    await interaction.update(settingsHomePanel(t, guild, creatorIndex.listByGuild(guildId)));
    return;
  }

  if (id === CustomId.settingsGuild) {
    const row = await ensureGuildConfigured(app, guildId);
    const tGuild = guildTranslator(app, guildId, row.settings);
    await interaction.update(guildSettingsPanel(tGuild, guild, row.settings, fallbackOwner, 'hub'));
    return;
  }

  const pageNav = parseSettingsPageId(id);
  if (pageNav) {
    const row = await ensureGuildConfigured(app, guildId);
    const tGuild = guildTranslator(app, guildId, row.settings);

    if (pageNav.scope === 'guild') {
      await interaction.update(
        guildSettingsPanel(tGuild, guild, row.settings, fallbackOwner, pageNav.page),
      );
      return;
    }

    const creator = creatorIndex.get(pageNav.scope.channelId);
    if (!creator) {
      await interaction.update(
        messagePanelEdit(tGuild, tGuild('panel.settings.homeTitle'), tGuild('panel.settings.gone')),
      );
      return;
    }

    await interaction.update(
      creatorSettingsPanel(
        tGuild,
        guild,
        pageNav.scope.channelId,
        row.settings,
        creator.settings,
        app.config.defaults.guild,
        fallbackOwner,
        pageNav.page,
      ),
    );
    return;
  }

  const removeChannelId = parseRemoveDoId(id);
  if (removeChannelId) {
    await interaction.deferUpdate();
    const ch = guild.channels.cache.get(removeChannelId);
    const channelCheck = checkBotChannelPermissions(guild, ch ?? null, undefined, t);
    if (!channelCheck.ok) {
      await interaction.editReply(messagePanelEdit(t, t('panel.botPermsTitle'), channelCheck.message));
      return;
    }

    const removed = await creatorRepo.remove(guildId, removeChannelId);
    if (!removed) {
      await interaction.editReply(
        messagePanelEdit(t, t('panel.remove.title'), t('panel.remove.notRegistered')),
      );
      return;
    }
    creatorIndex.unregister(removeChannelId);

    const guildRow = await guildConfigRepo.findById(guildId);
    if (ch?.isVoiceBased() && guildRow) {
      const actor = await guild.members.fetch(interaction.user.id).catch(() => null);
      app.modLogService.logDelete(guildId, guildRow.settings, ch, 'creator', actor);
    }

    if (ch?.isVoiceBased()) {
      try {
        await ch.delete(app.config.defaults.creatorRemoveReason);
      } catch (err) {
        await interaction.editReply(
          messagePanelEdit(
            t,
            t('panel.remove.deleteFailed'),
            formatDiscordErrorForUser(err, t('errors.actionRemove'), t),
          ),
        );
        return;
      }
    }
    await interaction.editReply(
      messagePanelEdit(t, t('panel.remove.title'), t('panel.remove.done', { name: ch?.name ?? removeChannelId })),
    );
    return;
  }

  const modLogEvent = parseEditModLogEvent(id);
  if (modLogEvent) {
    const row = await ensureGuildConfigured(app, guildId);
    const tGuild = guildTranslator(app, guildId, row.settings);
    const current = modLogTemplateValue(row.settings, modLogEvent);
    await showModLogTemplateModal(interaction, tGuild, modLogEvent, current);
    return;
  }

  const greetingScopeKey = parseEditGreetingScopeKey(id);
  if (greetingScopeKey) {
    const row = await ensureGuildConfigured(app, guildId);
    const defaults = app.config.defaults.guild;

    if (greetingScopeKey === 'g') {
      const tGuild = guildTranslator(app, guildId, row.settings);
      await showGreetingModal(interaction, tGuild, CustomId.modalGreeting('g'), row.settings.tempGreetingMessage);
      return;
    }

    const creator = creatorIndex.get(greetingScopeKey);
    if (!creator) {
      await interaction.update(
        messagePanelEdit(t, t('panel.settings.homeTitle'), t('panel.settings.gone')),
      );
      return;
    }

    const merged = mergeSettings(row.settings, creator.settings, defaults);
    const tGuild = guildTranslator(app, guildId, row.settings);
    await showGreetingModal(
      interaction,
      tGuild,
      CustomId.modalGreeting(greetingScopeKey),
      merged.tempGreetingMessage,
    );
    return;
  }

  const editTemplateChannelId = parseEditTemplateChannelId(id);
  if (editTemplateChannelId !== undefined) {
    const template =
      editTemplateChannelId === null
        ? (await app.guildConfigRepo.findById(guildId))?.settings.channelNameTemplate ?? ''
        : ((creatorIndex.get(editTemplateChannelId)?.settings.channelNameTemplate as string | undefined) ??
          (await ensureGuildConfigured(app, guildId)).settings.channelNameTemplate);
    const modalId =
      editTemplateChannelId === null
        ? CustomId.modalTemplateGuild
        : CustomId.modalTemplateCreator(editTemplateChannelId);
    await showTemplateModal(interaction, t, modalId, template);
  }
}

async function handleSelect(
  interaction: StringSelectMenuInteraction,
  app: AppContext,
  guild: NonNullable<StringSelectMenuInteraction['guild']>,
  guildId: string,
  fallbackOwner: readonly string[],
): Promise<void> {
  const { creatorIndex } = app;
  const id = interaction.customId;
  const value = interaction.values[0];
  const t = guildTranslator(app, guildId);

  if (id === CustomId.removeSelect && value) {
    const ch = guild.channels.cache.get(value);
    await interaction.update(removeConfirmPanel(t, ch?.name ?? value, value));
    return;
  }

  if (id === CustomId.settingsCreatorSelect && value) {
    const guildRow = await ensureGuildConfigured(app, guildId);
    const creator = creatorIndex.get(value);
    if (!creator) {
      await interaction.update(messagePanelEdit(t, t('panel.settings.homeTitle'), t('panel.settings.gone')));
      return;
    }
    const tGuild = guildTranslator(app, guildId, guildRow.settings);
    await interaction.update(
      creatorSettingsPanel(
        tGuild,
        guild,
        value,
        guildRow.settings,
        creator.settings,
        app.config.defaults.guild,
        fallbackOwner,
      ),
    );
    return;
  }

  for (const kind of SETTING_SELECT_KINDS) {
    const scope = parseScopedSelectId(id, kind);
    if (scope === null) continue;

    const patch = buildSettingsPatchFromSelect(kind, interaction);
    const page = subpageForSelectKind(kind);
    await persistSettingsAndRefresh(interaction, app, guild, guildId, scope, patch, fallbackOwner, page);
    return;
  }
}

async function persistSettingsAndRefresh(
  interaction: StringSelectMenuInteraction,
  app: AppContext,
  guild: NonNullable<StringSelectMenuInteraction['guild']>,
  guildId: string,
  scope: SettingsScope,
  patch: Partial<GuildSettings>,
  fallbackOwner: readonly string[],
  page: SettingsSubpage,
): Promise<void> {
  const { creatorRepo, creatorIndex, guildCache, guildConfigRepo } = app;

  if (scope === 'guild') {
    if ('modLogChannelId' in patch) {
      const guildRow = await guildConfigRepo.findById(guildId);
      const webhookPatch = await syncModLogWebhook(
        app.client,
        guild,
        guildRow?.settings ?? app.config.defaults.guild,
        patch.modLogChannelId ?? null,
      );
      Object.assign(patch, webhookPatch);
    }

    const updated = await guildConfigRepo.updateSettings(guildId, patch);
    guildCache.set(guildId, updated);
    const t = guildTranslator(app, guildId, updated);
    await interaction.update(guildSettingsPanel(t, guild, updated, fallbackOwner, page));
    return;
  }

  const updated = await creatorRepo.updateSettings(guildId, scope.channelId, patch);
  const creator = creatorIndex.get(scope.channelId);
  if (creator) creatorIndex.update({ ...creator, settings: updated });
  const guildRow = await guildConfigRepo.findById(guildId);
  const t = guildTranslator(app, guildId, guildRow!.settings);
  await interaction.update(
    creatorSettingsPanel(
      t,
      guild,
      scope.channelId,
      guildRow!.settings,
      updated,
      app.config.defaults.guild,
      fallbackOwner,
      page,
    ),
  );
}

async function handleModal(interaction: ModalSubmitInteraction, guildId: string): Promise<void> {
  const app = getAppContext();
  const { guildConfigRepo, creatorRepo, creatorIndex, guildCache } = app;
  const t = guildTranslator(app, guildId);

  const greetingScopeKey = parseModalGreetingScopeKey(interaction.customId);
  if (greetingScopeKey) {
    const message = interaction.fields.getTextInputValue('greeting').trim();
    const savedBodyKey = message ? 'panel.greeting.savedBody' : 'panel.greeting.savedDisabled';

    if (greetingScopeKey === 'g') {
      const updated = await guildConfigRepo.updateSettings(guildId, { tempGreetingMessage: message });
      guildCache.set(guildId, updated);
      const tUpdated = guildTranslator(app, guildId, updated);
      await interaction.reply(
        messagePanelReply(tUpdated, tUpdated('panel.greeting.savedTitle'), tUpdated(savedBodyKey), false),
      );
      return;
    }

    const updated = await creatorRepo.updateSettings(guildId, greetingScopeKey, {
      tempGreetingMessage: message,
    });
    const creator = creatorIndex.get(greetingScopeKey);
    if (creator) creatorIndex.update({ ...creator, settings: updated });
    await interaction.reply(
      messagePanelReply(
        t,
        t('panel.greeting.savedTitle'),
        t(message ? 'panel.greeting.savedCreator' : 'panel.greeting.savedDisabled'),
        false,
      ),
    );
    return;
  }

  const modLogEvent = parseModalModLogEvent(interaction.customId);
  if (modLogEvent) {
    const template = interaction.fields.getTextInputValue('modLogTemplate').trim();
    if (!template) {
      await interaction.reply(
        messagePanelReply(t, t('panel.modLog.invalidTitle'), t('panel.modLog.empty')),
      );
      return;
    }

    const updated = await guildConfigRepo.updateSettings(
      guildId,
      modLogTemplatePatch(modLogEvent, template),
    );
    guildCache.set(guildId, updated);
    const tUpdated = guildTranslator(app, guildId, updated);
    const savedBody = tUpdated(modLogSavedMessageKey(modLogEvent));

    await interaction.reply(
      messagePanelReply(tUpdated, tUpdated('panel.modLog.savedTitle'), savedBody, false),
    );
    return;
  }

  const template = interaction.fields.getTextInputValue('template').trim();

  if (!template) {
    await interaction.reply(
      messagePanelReply(t, t('panel.template.invalidTitle'), t('panel.template.empty')),
    );
    return;
  }

  const channelId = parseModalTemplateChannelId(interaction.customId);
  if (channelId === undefined) return;

  if (channelId === null) {
    const updated = await guildConfigRepo.updateSettings(guildId, { channelNameTemplate: template });
    guildCache.set(guildId, updated);
    const tUpdated = guildTranslator(app, guildId, updated);
    await interaction.reply(
      messagePanelReply(
        tUpdated,
        tUpdated('panel.template.savedTitle'),
        tUpdated('panel.template.savedGuild', { template }),
        false,
      ),
    );
    return;
  }

  const updated = await creatorRepo.updateSettings(guildId, channelId, { channelNameTemplate: template });
  const creator = creatorIndex.get(channelId);
  if (creator) creatorIndex.update({ ...creator, settings: updated });
  await interaction.reply(
    messagePanelReply(
      t,
      t('panel.template.savedTitle'),
      t('panel.template.savedCreator', { template }),
      false,
    ),
  );
}

async function showModLogTemplateModal(
  interaction: ButtonInteraction,
  t: Translator,
  event: ModLogEvent,
  currentTemplate: string,
): Promise<void> {
  const input = new TextInputBuilder()
    .setCustomId('modLogTemplate')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setValue(currentTemplate.slice(0, 2000))
    .setMaxLength(2000);

  const modalTitle = t(modLogModalTitleKey(event));

  const modal = new ModalBuilder()
    .setCustomId(CustomId.modalModLogTemplate(event))
    .setTitle(modalTitle)
    .addLabelComponents(
      new LabelBuilder().setLabel(t('panel.modLog.modalLabel')).setTextInputComponent(input),
    );

  await interaction.showModal(modal);
}

async function showGreetingModal(
  interaction: ButtonInteraction,
  t: Translator,
  modalId: string,
  currentMessage: string,
): Promise<void> {
  const input = new TextInputBuilder()
    .setCustomId('greeting')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setValue(currentMessage.slice(0, 2000))
    .setMaxLength(2000);

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(t('panel.greeting.modalTitle'))
    .addLabelComponents(
      new LabelBuilder().setLabel(t('panel.greeting.modalLabel')).setTextInputComponent(input),
    );

  await interaction.showModal(modal);
}

async function showTemplateModal(
  interaction: ButtonInteraction,
  t: Translator,
  modalId: string,
  currentTemplate: string,
): Promise<void> {
  const input = new TextInputBuilder()
    .setCustomId('template')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(currentTemplate.slice(0, 100))
    .setMaxLength(100);

  const modal = new ModalBuilder()
    .setCustomId(modalId)
    .setTitle(t('panel.template.modalTitle'))
    .addLabelComponents(new LabelBuilder().setLabel(t('panel.template.modalLabel')).setTextInputComponent(input));

  await interaction.showModal(modal);
}

const MOD_LOG_SAVED_KEYS: Record<ModLogEvent, MessageKey> = {
  create: 'panel.modLog.savedCreate',
  update: 'panel.modLog.savedUpdate',
  delete: 'panel.modLog.savedDelete',
  join: 'panel.modLog.savedJoin',
  leave: 'panel.modLog.savedLeave',
};

const MOD_LOG_MODAL_TITLE_KEYS: Record<ModLogEvent, MessageKey> = {
  create: 'panel.modLog.modalCreate',
  update: 'panel.modLog.modalUpdate',
  delete: 'panel.modLog.modalDelete',
  join: 'panel.modLog.modalJoin',
  leave: 'panel.modLog.modalLeave',
};

function modLogSavedMessageKey(event: ModLogEvent): MessageKey {
  return MOD_LOG_SAVED_KEYS[event];
}

function modLogModalTitleKey(event: ModLogEvent): MessageKey {
  return MOD_LOG_MODAL_TITLE_KEYS[event];
}

export async function openCreatorPanel(
  interaction: import('discord.js').ChatInputCommandInteraction,
): Promise<void> {
  if (!(await requireManageGuild(interaction))) return;
  const app = getAppContext();
  if (!interaction.guild) return;
  const row = await ensureGuildConfigured(app, interaction.guild.id);
  const t = guildTranslator(app, interaction.guild.id, row.settings);
  await interaction.reply(mainPanel(t));
}
