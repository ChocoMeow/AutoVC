import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  StringSelectMenuBuilder,
  type GuildMember,
  type MessageCreateOptions,
  type MessageEditOptions,
  type VoiceChannel,
} from 'discord.js';
import type { AppContext } from '@/app-context.ts';
import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';
import { buildChannelTemplateContext } from '@/domain/naming/build-template-context.ts';
import type { TempChannelSettings } from '@/domain/temp-channel-settings.ts';
import { TempVcId } from '@/discord/components/temp-voice-ids.ts';
import { CHANNEL_V2_FLAGS } from '@/discord/components/ui-flags.ts';
import {
  regionSelectOptions,
  resolveRegionSelectValue,
  resolveUserLimitSelectValue,
  userLimitSelectOptions,
} from '@/discord/components/voice-options.ts';
import type { CreatorConfig } from '@/infra/cache/creator-channel-index.ts';
import type { TempChannelMeta } from '@/infra/cache/temp-channel-registry.ts';
import { guildTranslator } from '@/i18n/guild-translator.ts';
import type { Translator } from '@/i18n/translator.ts';

const ACCENT_TEMP = 0x5865f2;
const MAX_MEMBER_SELECT_OPTIONS = 25;

type SelectOption = {
  label: string;
  value: string;
  default?: boolean;
  description?: string;
};

function selectRow(
  customId: string,
  placeholder: string,
  options: SelectOption[],
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(
        options.map((o) => ({
          label: o.label,
          value: o.value,
          default: o.default,
          ...(o.description ? { description: o.description.slice(0, 100) } : {}),
        })),
      ),
  );
}

export async function postTempVoiceChatMessages(
  app: AppContext,
  tempChannel: VoiceChannel,
  member: GuildMember,
  creator: CreatorConfig,
  settings: GuildSettingsRecord,
): Promise<void> {
  const t = guildTranslator(app, creator.guildId, settings);
  const meta = app.tempRegistry.get(tempChannel.id);
  if (!meta) return;

  const greeting = settings.tempGreetingMessage.trim();
  if (greeting) {
    const text = await renderGreeting(app, greeting, meta, tempChannel, creator);
    if (text.trim()) {
      await tempChannel.send(text).catch((err) => {
        app.logger.warn({ err, channelId: tempChannel.id }, 'Failed to send temp greeting');
      });
    }
  }

  if (!settings.tempInterfaceEnabled) return;

  const msg = await tempChannel
    .send(buildTempInterfacePayload(t, tempChannel, settings, meta.settings))
    .catch((err) => {
      app.logger.warn({ err, channelId: tempChannel.id }, 'Failed to send temp interface');
      return null;
    });
  if (msg) app.tempRegistry.setInterfaceMessage(tempChannel.id, msg.id);
}

export async function editTempInterfaceMessage(
  app: AppContext,
  channel: VoiceChannel,
  settings: GuildSettingsRecord,
  t: Translator,
): Promise<void> {
  const meta = app.tempRegistry.get(channel.id);
  if (!meta?.interfaceMessageId) return;

  const msg = await channel.messages.fetch(meta.interfaceMessageId).catch(() => null);
  if (!msg) return;

  await msg.edit(buildTempInterfacePayload(t, channel, settings, meta.settings)).catch(() => undefined);
}

export function buildTempInterfacePayload(
  t: Translator,
  channel: VoiceChannel,
  settings: GuildSettingsRecord,
  tempSettings?: TempChannelSettings,
): MessageCreateOptions & MessageEditOptions {
  return {
    components: [buildTempInterfaceContainer(t, channel, settings, tempSettings)],
    flags: CHANNEL_V2_FLAGS,
  };
}

function buildTempInterfaceContainer(
  t: Translator,
  channel: VoiceChannel,
  settings: GuildSettingsRecord,
  tempSettings?: TempChannelSettings,
): ContainerBuilder {
  const limitValue = resolveUserLimitSelectValue(
    channel.userLimit,
    settings.userLimit,
    tempSettings?.userLimit,
  );
  const regionValue = resolveRegionSelectValue(
    channel.rtcRegion,
    settings.rtcRegion,
    tempSettings?.rtcRegion,
  );

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_TEMP)
    .addTextDisplayComponents((c) => c.setContent(t('tempInterface.sectionTitle')))
    .addTextDisplayComponents((c) => c.setContent(t('tempInterface.sectionIntro')))
    .addTextDisplayComponents((c) => c.setContent(t('tempInterface.descChannel')))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(TempVcId.button(channel.id, 'rename'))
          .setLabel(t('tempInterface.rename'))
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(TempVcId.button(channel.id, 'delete'))
          .setLabel(t('tempInterface.delete'))
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(TempVcId.button(channel.id, 'refresh'))
          .setLabel(t('tempInterface.refresh'))
          .setStyle(ButtonStyle.Secondary),
      ),
    )
    .addTextDisplayComponents((c) => c.setContent(t('tempInterface.descLimit')))
    .addActionRowComponents(
      selectRow(
        TempVcId.selectLimit(channel.id),
        t('tempInterface.selectLimit'),
        userLimitSelectOptions(t, limitValue),
      ),
    )
    .addTextDisplayComponents((c) => c.setContent(t('tempInterface.descRegion')))
    .addActionRowComponents(
      selectRow(
        TempVcId.selectRegion(channel.id),
        t('tempInterface.selectRegion'),
        regionSelectOptions(t, regionValue),
      ),
    );

  const memberOptions = buildMemberActionOptions(t, channel);
  if (memberOptions.length > 0) {
    container
      .addTextDisplayComponents((c) => c.setContent(t('tempInterface.descMembers')))
      .addActionRowComponents(
        selectRow(TempVcId.selectMember(channel.id), t('tempInterface.selectMember'), memberOptions),
      );
  }

  return container;
}

function buildMemberActionOptions(
  t: Translator,
  channel: VoiceChannel,
): SelectOption[] {
  const members = [...channel.members.values()].filter((m) => !m.user.bot);
  const actions = [
    { action: 'kick' as const, label: t('tempInterface.kickOption') },
    { action: 'block' as const, label: t('tempInterface.blockOption') },
    { action: 'transfer' as const, label: t('tempInterface.transferOption') },
  ];

  const options: SelectOption[] = [];
  for (const member of members) {
    const name = member.displayName.slice(0, 80);
    for (const { action, label } of actions) {
      if (options.length >= MAX_MEMBER_SELECT_OPTIONS) return options;
      options.push({
        label: `${label} · ${name}`.slice(0, 100),
        value: `${action}:${member.id}`,
        description: name.slice(0, 100),
      });
    }
  }
  return options;
}

async function renderGreeting(
  app: AppContext,
  template: string,
  meta: TempChannelMeta,
  channel: VoiceChannel,
  creator: CreatorConfig,
): Promise<string> {
  const ctx = await buildChannelTemplateContext(app, meta, channel, creator, { forNewChannel: true });
  if (!ctx) return template;
  return app.templateEngine.render(template, ctx, { profile: 'message' });
}
