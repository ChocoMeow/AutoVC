import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  StringSelectMenuBuilder,
  type Guild,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from 'discord.js';
import type { CreatorConfig } from '@/infra/cache/creator-channel-index.ts';
import { creatorChannelSelectOptions } from '@/discord/components/creator-select-options.ts';
import { CustomId } from '@/discord/components/custom-ids.ts';
import {
  ACCENT_GUILD,
  ACCENT_SETTINGS_HOME,
  panelEdit,
  panelReply,
  sectionDivider,
} from '@/discord/components/panel-primitives.ts';
import type { Translator } from '@/i18n/translator.ts';

function backRow(t: Translator, label?: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CustomId.main)
      .setLabel(label ?? t('panel.backMain'))
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildContainer(body: string, ...rows: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[]) {
  const container = new ContainerBuilder().addTextDisplayComponents((text) => text.setContent(body));
  for (const row of rows) container.addActionRowComponents(row);
  return container;
}

function buildMainContainer(t: Translator): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ACCENT_GUILD)
    .addTextDisplayComponents((c) =>
      c.setContent([t('panel.main.title'), t('panel.main.body'), '', t('panel.main.hint')].join('\n')),
    )
    .addSeparatorComponents(sectionDivider())
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(CustomId.create)
          .setLabel(t('panel.main.create'))
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(CustomId.removeMenu)
          .setLabel(t('panel.main.remove'))
          .setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(CustomId.list)
          .setLabel(t('panel.main.list'))
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(CustomId.settings)
          .setLabel(t('panel.main.settings'))
          .setStyle(ButtonStyle.Secondary),
      ),
    );
}

export function mainPanel(t: Translator): InteractionReplyOptions {
  return panelReply([buildMainContainer(t)]);
}

export function mainPanelEdit(t: Translator): InteractionEditReplyOptions {
  return panelEdit([buildMainContainer(t)]);
}

function buildMessageContainer(t: Translator, title: string, body: string, showBack: boolean): ContainerBuilder {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_GUILD)
    .addTextDisplayComponents((c) => c.setContent(`# ${title}\n\n${body}`));
  if (showBack) container.addActionRowComponents(backRow(t));
  return container;
}

export function messagePanelEdit(
  t: Translator,
  title: string,
  body: string,
  showBack = true,
): InteractionEditReplyOptions {
  return panelEdit([buildMessageContainer(t, title, body, showBack)]);
}

export function messagePanelReply(
  t: Translator,
  title: string,
  body: string,
  showBack = true,
): InteractionReplyOptions {
  return panelReply([buildMessageContainer(t, title, body, showBack)]);
}

export function listPanel(
  t: Translator,
  guild: Guild,
  creators: CreatorConfig[],
): InteractionEditReplyOptions {
  if (!creators.length) {
    return messagePanelEdit(t, t('panel.list.title'), t('panel.list.empty'));
  }

  const lines = creators.map((c) => {
    const ch = guild.channels.cache.get(c.channelId);
    const name = ch?.name ?? c.channelId;
    const label = c.label ? ` — *${c.label}*` : '';
    return `• **${name}** \`${c.channelId}\`${label}`;
  });

  return messagePanelEdit(t, t('panel.list.title'), lines.join('\n'));
}

export function removePanel(
  t: Translator,
  guild: Guild,
  creators: CreatorConfig[],
): InteractionEditReplyOptions {
  if (!creators.length) {
    return messagePanelEdit(t, t('panel.remove.title'), t('panel.remove.empty'));
  }

  const options = creatorChannelSelectOptions(guild, creators, t('panel.creatorSelectJoin'));
  const selectRow = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(CustomId.removeSelect)
      .setPlaceholder(t('panel.remove.placeholder'))
      .addOptions(options),
  );

  const container = new ContainerBuilder()
    .addTextDisplayComponents((c) => c.setContent(t('panel.remove.body')))
    .addActionRowComponents(selectRow)
    .addActionRowComponents(backRow(t));

  return panelEdit([container]);
}

export function removeConfirmPanel(
  t: Translator,
  channelName: string,
  channelId: string,
): InteractionEditReplyOptions {
  const container = buildContainer(
    t('panel.remove.confirmTitle', { name: channelName }),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomId.removeDo(channelId))
        .setLabel(t('panel.remove.confirm'))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(CustomId.removeMenu)
        .setLabel(t('panel.remove.cancel'))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  return panelEdit([container]);
}

export function settingsHomePanel(
  t: Translator,
  guild: Guild,
  creators: CreatorConfig[],
): InteractionEditReplyOptions {
  const header = new ContainerBuilder()
    .setAccentColor(ACCENT_SETTINGS_HOME)
    .addTextDisplayComponents((c) =>
      c.setContent(
        [t('panel.settings.homeTitle'), t('panel.settings.homeBody'), '', t('panel.settings.homeGuild'), t('panel.settings.homeCreator')].join(
          '\n',
        ),
      ),
    )
    .addSeparatorComponents(sectionDivider())
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(CustomId.settingsGuild)
          .setLabel(t('panel.settings.guildButton'))
          .setStyle(ButtonStyle.Primary),
      ),
    );

  const containers: ContainerBuilder[] = [header];

  if (creators.length > 0) {
    const options = creatorChannelSelectOptions(guild, creators, t('panel.creatorSelectSettings'));
    const picker = new ContainerBuilder()
      .addTextDisplayComponents((c) => c.setContent(t('panel.settings.creatorPicker')))
      .addActionRowComponents(
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(CustomId.settingsCreatorSelect)
            .setPlaceholder(t('panel.settings.creatorPlaceholder'))
            .addOptions(options),
        ),
      );
    containers.push(picker);
  } else {
    header.addTextDisplayComponents((c) => c.setContent(t('panel.settings.noCreators')));
  }

  containers.push(new ContainerBuilder().addActionRowComponents(backRow(t)));
  return panelEdit(containers);
}

export { creatorSettingsPanel, guildSettingsPanel } from '@/discord/components/creator-ui-settings.ts';
