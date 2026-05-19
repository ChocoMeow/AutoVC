import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  StringSelectMenuBuilder,
  type Guild,
  type InteractionEditReplyOptions,
} from 'discord.js';
import { mergeSettings } from '@/domain/settings/settings-merger.ts';
import type {
  GuildSettingsRecord,
  TempChannelPosition,
  TempPermissionSync,
} from '@/domain/settings/guild-settings.ts';
import { OWNER_PERMISSION_KEYS, type OwnerPermissionKey } from '@/domain/settings/owner-permissions.ts';
import {
  formatOwnerPermissionLabels,
  resolveOwnerPermissionNames,
} from '@/domain/voice/temp-channel-permissions.ts';
import { guildCategorySelectOptions } from '@/discord/components/category-select-options.ts';
import { modLogChannelSelectOptions } from '@/discord/components/log-channel-options.ts';
import { CustomId } from '@/discord/components/custom-ids.ts';
import {
  ACCENT_CREATOR,
  ACCENT_GUILD,
  panelEdit,
  sectionDivider,
} from '@/discord/components/panel-primitives.ts';
import { scopedSelectId, scopeKey, type SettingsScope } from '@/discord/components/settings-scope.ts';
import { regionSelectOptions, userLimitSelectOptions } from '@/discord/components/voice-options.ts';
import {
  guildOnlySubpage,
  settingsPageId,
  type SettingsSubpage,
} from '@/discord/components/settings-pages.ts';
import { LOCALE_IDS, localeDisplayName } from '@/i18n/index.ts';
import type { Translator } from '@/i18n/translator.ts';

const DELETE_DELAY_OPTIONS = [1_000, 3_000, 5_000, 10_000, 15_000, 30_000] as const;
const BITRATE_OPTIONS = [null, 8, 16, 32, 64, 96, 128, 256, 384] as const;
const MAX_CHANNELS_OPTIONS = [null, 1, 2, 3, 4, 5, 10] as const;
const TEMP_CHANNEL_POSITION_OPTIONS: TempChannelPosition[] = ['top', 'belowCreator', 'bottom'];

const ON_OFF = [
  { value: 'on', labelKey: 'panel.settings.enabled' as const },
  { value: 'off', labelKey: 'panel.settings.disabled' as const },
];

export interface SettingsPanelOpts {
  t: Translator;
  settings: GuildSettingsRecord;
  fallbackOwner: readonly string[];
  scope: SettingsScope;
  page: SettingsSubpage;
  channelName?: string;
  guild?: Guild;
}

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

function settingDesc(t: Translator, key: Parameters<Translator>[0]): string {
  return t(key);
}

function navButton(t: Translator, scope: SettingsScope, page: SettingsSubpage, label: string) {
  return new ButtonBuilder()
    .setCustomId(settingsPageId(scope, page))
    .setLabel(label)
    .setStyle(ButtonStyle.Primary);
}

function formatTempCategory(
  t: Translator,
  guild: Guild | undefined,
  settings: GuildSettingsRecord,
): string {
  const id = settings.tempCategoryId ?? settings.categoryId;
  if (!id) return t('panel.settings.tempCategoryAuto');
  const category = guild?.channels.cache.get(id);
  return category?.name ?? id;
}

function settingsSnapshot(
  t: Translator,
  settings: GuildSettingsRecord,
  fallbackOwner: readonly string[],
  guild?: Guild,
): string {
  const ownerPerms = formatOwnerPermissionLabels(settings, fallbackOwner, t);
  const ownerShort = ownerPerms.length > 48 ? `${ownerPerms.slice(0, 45)}…` : ownerPerms;
  const template = settings.channelNameTemplate;
  const templatePreview = template.length > 36 ? `${template.slice(0, 33)}…` : template;

  return [
    t('panel.settings.snapshotTitle'),
    '',
    t('panel.settings.snapshotVoice', {
      bitrate: settings.bitrate ? `${settings.bitrate} kbps` : t('panel.settings.discordDefault'),
      limit: formatUserLimit(t, settings.userLimit),
      region: formatRegion(t, settings.rtcRegion),
    }),
    t('panel.settings.snapshotAccess', {
      sync: t(`permissions.sync.${settings.tempPermissionSync}`),
      owner: ownerShort,
    }),
    t('panel.settings.snapshotBehavior', {
      category: formatTempCategory(t, guild, settings),
      position: t(`panel.settings.position.${settings.tempChannelPosition}`),
      delay: settings.deleteDelayMs / 1000,
      max: settings.maxChannelsPerUser ?? '∞',
    }),
    t('panel.settings.snapshotNaming', { template: templatePreview }),
    settings.modLogChannelId
      ? t('panel.settings.snapshotModLog', { channel: `<#${settings.modLogChannelId}>` })
      : t('panel.settings.snapshotModLogOff'),
  ].join('\n');
}

function formatUserLimit(t: Translator, limit: number | null): string {
  if (limit === null) return t('panel.settings.discordDefault');
  if (limit === 0) return t('panel.settings.noUserCap');
  return t('panel.settings.usersMax', { n: limit });
}

function formatRegion(t: Translator, region: string | null): string {
  if (!region || region === 'auto') return t('panel.settings.regionAutomatic');
  return region;
}

function subpageTitle(t: Translator, page: Exclude<SettingsSubpage, 'hub'>): string {
  switch (page) {
    case 'permissions':
      return t('panel.settings.subpage.permissions');
    case 'voice':
      return t('panel.settings.subpage.voice');
    case 'behavior':
      return t('panel.settings.subpage.behavior');
    case 'chat':
      return t('panel.settings.subpage.chat');
    case 'modlog':
      return t('panel.settings.subpage.modlog');
    case 'general':
      return t('panel.settings.subpage.general');
  }
}

function pageHeader(t: Translator, opts: SettingsPanelOpts): ContainerBuilder {
  const accent = opts.scope === 'guild' ? ACCENT_GUILD : ACCENT_CREATOR;
  const title =
    opts.scope === 'guild'
      ? [t('panel.settings.guildHeader'), t('panel.settings.guildHint')].join('\n')
      : [
          t('panel.settings.creatorHeader', { name: opts.channelName ?? 'Channel' }),
          t('panel.settings.creatorHint'),
        ].join('\n');

  const container = new ContainerBuilder()
    .setAccentColor(accent)
    .addTextDisplayComponents((c) => c.setContent(title));

  const { page } = opts;
  if (page === 'hub') {
    container
      .addTextDisplayComponents((c) =>
        c.setContent(settingsSnapshot(t, opts.settings, opts.fallbackOwner, opts.guild)),
      )
      .addTextDisplayComponents((c) => c.setContent(t('panel.settings.hintInstant')));
  } else {
    container.addTextDisplayComponents((c) => c.setContent(subpageTitle(t, page)));
  }

  return container;
}

function footerBack(
  t: Translator,
  scope: SettingsScope,
  page: SettingsSubpage,
): ContainerBuilder {
  const label =
    page === 'hub' ? t('panel.backSettings') : t('panel.settings.backHub');
  const customId = page === 'hub' ? CustomId.settings : settingsPageId(scope, 'hub');

  return new ContainerBuilder().addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(CustomId.main)
        .setLabel(t('panel.backMain'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(ButtonStyle.Secondary),
    ),
  );
}

function buildHubPage(t: Translator, opts: SettingsPanelOpts): ContainerBuilder[] {
  const { scope } = opts;
  const nav = new ContainerBuilder()
    .addTextDisplayComponents((c) => c.setContent(t('panel.settings.hubNav')))
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        navButton(t, scope, 'permissions', t('panel.settings.navPermissions')),
        navButton(t, scope, 'voice', t('panel.settings.navVoice')),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        navButton(t, scope, 'behavior', t('panel.settings.navBehavior')),
        navButton(t, scope, 'chat', t('panel.settings.navChat')),
        ...(scope === 'guild'
          ? [
              navButton(t, scope, 'modlog', t('panel.settings.navModLog')),
              navButton(t, scope, 'general', t('panel.settings.navGeneral')),
            ]
          : []),
      ),
    );

  return [pageHeader(t, opts), nav];
}

function buildPermissionsPage(t: Translator, opts: SettingsPanelOpts): ContainerBuilder[] {
  const syncModes: TempPermissionSync[] = ['category', 'creator', 'none'];
  const ownerSelected = resolveOwnerPermissionNames(
    opts.settings,
    opts.fallbackOwner,
  ) as OwnerPermissionKey[];

  const body = new ContainerBuilder()
    .addTextDisplayComponents((c) => c.setContent(t('panel.settings.sectionPermissions')))
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descSync')))
    .addActionRowComponents(
      selectRow(
        scopedSelectId('ss', opts.scope),
        t('panel.settings.selectSync'),
        syncModes.map((mode) => ({
          label: t(`permissions.sync.${mode}`),
          description: t(`permissions.syncDesc.${mode}`),
          value: mode,
          default: mode === opts.settings.tempPermissionSync,
        })),
      ),
    )
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descOwner')))
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(scopedSelectId('so', opts.scope))
          .setPlaceholder(t('panel.settings.selectOwner'))
          .setMinValues(0)
          .setMaxValues(OWNER_PERMISSION_KEYS.length)
          .addOptions(
            OWNER_PERMISSION_KEYS.map((key) => ({
              label: t(`ownerPermissions.${key}`).slice(0, 100),
              description: t(`ownerPermissionsDesc.${key}`).slice(0, 100),
              value: key,
              default: ownerSelected.includes(key),
            })),
          ),
      ),
    );

  return [pageHeader(t, opts), body];
}

function buildVoicePage(t: Translator, opts: SettingsPanelOpts): ContainerBuilder[] {
  const body = new ContainerBuilder()
    .addTextDisplayComponents((c) => c.setContent(t('panel.settings.sectionVoice')))
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descBitrate')))
    .addActionRowComponents(
      selectRow(
        scopedSelectId('br', opts.scope),
        t('panel.settings.selectBitrate'),
        BITRATE_OPTIONS.map((kbps) => ({
          label:
            kbps === null ? t('panel.settings.bitrateDefault') : t('panel.settings.bitrateKbps', { n: kbps }),
          value: kbps === null ? 'default' : String(kbps),
          default: kbps === opts.settings.bitrate,
        })),
      ),
    )
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descUserLimit')))
    .addActionRowComponents(
      selectRow(
        scopedSelectId('ul', opts.scope),
        t('panel.settings.selectUserLimit'),
        userLimitSelectOptions(
          t,
          opts.settings.userLimit === null ? 'default' : String(opts.settings.userLimit),
        ),
      ),
    )
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descRegion')))
    .addActionRowComponents(
      selectRow(
        scopedSelectId('rg', opts.scope),
        t('panel.settings.selectRegion'),
        regionSelectOptions(
          t,
          !opts.settings.rtcRegion || opts.settings.rtcRegion === 'auto'
            ? 'auto'
            : opts.settings.rtcRegion,
        ),
      ),
    );

  return [pageHeader(t, opts), body];
}

function buildBehaviorPage(t: Translator, opts: SettingsPanelOpts): ContainerBuilder[] {
  const templateButtonId =
    opts.scope === 'guild'
      ? CustomId.editTemplateGuild
      : CustomId.editTemplateCreator(opts.scope.channelId);

  const categoryRow = opts.guild
    ? selectRow(
        scopedSelectId('tc', opts.scope),
        t('panel.settings.selectTempCategory'),
        [
          {
            label: t('panel.settings.tempCategoryAuto'),
            value: 'default',
            default: !opts.settings.tempCategoryId,
          },
          ...guildCategorySelectOptions(opts.guild).map((o) => ({
            ...o,
            default: o.value === opts.settings.tempCategoryId,
          })),
        ],
      )
    : null;

  const body = new ContainerBuilder()
    .addTextDisplayComponents((c) => c.setContent(t('panel.settings.sectionBehavior')))
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descTempCategory')))
    .addActionRowComponents(...(categoryRow ? [categoryRow] : []))
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descDeleteDelay')))
    .addActionRowComponents(
      selectRow(
        scopedSelectId('sd', opts.scope),
        t('panel.settings.selectDeleteDelay'),
        DELETE_DELAY_OPTIONS.map((ms) => ({
          label: t('panel.settings.delaySeconds', { n: ms / 1000 }),
          value: String(ms),
          default: ms === opts.settings.deleteDelayMs,
        })),
      ),
    )
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descMaxChannels')))
    .addActionRowComponents(
      selectRow(
        scopedSelectId('mc', opts.scope),
        t('panel.settings.selectMaxChannels'),
        MAX_CHANNELS_OPTIONS.map((n) => ({
          label: n === null ? t('panel.settings.maxUnlimited') : String(n),
          value: n === null ? 'default' : String(n),
          default: n === opts.settings.maxChannelsPerUser,
        })),
      ),
    )
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descPosition')))
    .addActionRowComponents(
      selectRow(
        scopedSelectId('tp', opts.scope),
        t('panel.settings.selectPosition'),
        TEMP_CHANNEL_POSITION_OPTIONS.map((pos) => ({
          label: t(`panel.settings.position.${pos}`),
          description: t(`panel.settings.positionDesc.${pos}`),
          value: pos,
          default: pos === opts.settings.tempChannelPosition,
        })),
      ),
    )
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descTemplate')))
    .addSeparatorComponents(sectionDivider())
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(templateButtonId)
          .setLabel(t('panel.settings.editTemplate'))
          .setStyle(ButtonStyle.Primary),
      ),
    );

  return [pageHeader(t, opts), body];
}

function buildChatPage(t: Translator, opts: SettingsPanelOpts): ContainerBuilder[] {
  const sk = scopeKey(opts.scope);
  const body = new ContainerBuilder()
    .addTextDisplayComponents((c) => c.setContent(t('panel.settings.sectionChat')))
    .addTextDisplayComponents((c) =>
      c.setContent(
        settingDesc(
          t,
          opts.scope === 'guild' ? 'panel.settings.descGreeting' : 'panel.settings.descGreetingCreator',
        ),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(CustomId.editGreeting(sk))
          .setLabel(t('panel.settings.editGreeting'))
          .setStyle(ButtonStyle.Secondary),
      ),
    );

  body
    .addTextDisplayComponents((c) =>
      c.setContent(
        settingDesc(
          t,
          opts.scope === 'guild' ? 'panel.settings.descInterface' : 'panel.settings.descInterfaceCreator',
        ),
      ),
    )
    .addActionRowComponents(
      selectRow(
        scopedSelectId('ie', opts.scope),
        t('panel.settings.selectInterface'),
        ON_OFF.map((o) => ({
          label: t(o.labelKey),
          value: o.value,
          default: o.value === (opts.settings.tempInterfaceEnabled ? 'on' : 'off'),
        })),
      ),
    );

  return [pageHeader(t, opts), body];
}

function buildModLogPage(t: Translator, opts: SettingsPanelOpts): ContainerBuilder[] {
  if (!opts.guild) return buildHubPage(t, opts);

  const logOptions = modLogChannelSelectOptions(opts.guild);
  const body = new ContainerBuilder()
    .addTextDisplayComponents((c) => c.setContent(t('panel.settings.sectionModLog')))
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descModLogChannel')))
    .addTextDisplayComponents((c) => c.setContent(t('panel.settings.modLogHint')))
    .addActionRowComponents(
      selectRow(scopedSelectId('ml', 'guild'), t('panel.settings.selectModLogChannel'), [
        {
          label: t('panel.settings.modLogDisabled'),
          value: 'disabled',
          default: !opts.settings.modLogChannelId,
        },
        ...logOptions.map((o) => ({
          ...o,
          default: o.value === opts.settings.modLogChannelId,
        })),
      ]),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(CustomId.editModLogTemplate('create'))
          .setLabel(t('panel.settings.modLogEditCreate'))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(CustomId.editModLogTemplate('update'))
          .setLabel(t('panel.settings.modLogEditUpdate'))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(CustomId.editModLogTemplate('delete'))
          .setLabel(t('panel.settings.modLogEditDelete'))
          .setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(CustomId.editModLogTemplate('join'))
          .setLabel(t('panel.settings.modLogEditJoin'))
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(CustomId.editModLogTemplate('leave'))
          .setLabel(t('panel.settings.modLogEditLeave'))
          .setStyle(ButtonStyle.Secondary),
      ),
    );

  return [pageHeader(t, opts), body];
}

function buildGeneralPage(t: Translator, opts: SettingsPanelOpts): ContainerBuilder[] {
  const body = new ContainerBuilder()
    .addTextDisplayComponents((c) => c.setContent(t('panel.settings.sectionLanguage')))
    .addTextDisplayComponents((c) => c.setContent(settingDesc(t, 'panel.settings.descLanguage')))
    .addActionRowComponents(
      selectRow(
        scopedSelectId('ln', 'guild'),
        t('panel.settings.selectLanguage'),
        LOCALE_IDS.map((id) => ({
          label: localeDisplayName(id),
          value: id,
          default: id === opts.settings.locale,
        })),
      ),
    );

  return [pageHeader(t, opts), body];
}

export function renderSettingsPanel(opts: SettingsPanelOpts): InteractionEditReplyOptions {
  let page = opts.page;
  if (opts.scope !== 'guild' && guildOnlySubpage(page)) {
    page = 'hub';
  }

  const containers: ContainerBuilder[] = [];
  switch (page) {
    case 'hub':
      containers.push(...buildHubPage(opts.t, { ...opts, page }));
      break;
    case 'permissions':
      containers.push(...buildPermissionsPage(opts.t, { ...opts, page }));
      break;
    case 'voice':
      containers.push(...buildVoicePage(opts.t, { ...opts, page }));
      break;
    case 'behavior':
      containers.push(...buildBehaviorPage(opts.t, { ...opts, page }));
      break;
    case 'chat':
      containers.push(...buildChatPage(opts.t, { ...opts, page }));
      break;
    case 'modlog':
      containers.push(...buildModLogPage(opts.t, { ...opts, page }));
      break;
    case 'general':
      containers.push(...buildGeneralPage(opts.t, { ...opts, page }));
      break;
  }

  containers.push(footerBack(opts.t, opts.scope, page));
  return panelEdit(containers);
}

export function guildSettingsPanel(
  t: Translator,
  guild: Guild,
  settings: GuildSettingsRecord,
  fallbackOwner: readonly string[],
  page: SettingsSubpage = 'hub',
): InteractionEditReplyOptions {
  return renderSettingsPanel({
    t,
    settings,
    fallbackOwner,
    scope: 'guild',
    guild,
    page,
  });
}

export function creatorSettingsPanel(
  t: Translator,
  guild: Guild,
  channelId: string,
  guildSettings: GuildSettingsRecord,
  creatorSettings: Partial<GuildSettingsRecord>,
  guildDefaults: GuildSettingsRecord,
  fallbackOwner: readonly string[],
  page: SettingsSubpage = 'hub',
): InteractionEditReplyOptions {
  const ch = guild.channels.cache.get(channelId);
  const effective = mergeSettings(guildSettings, creatorSettings, guildDefaults);
  return renderSettingsPanel({
    t,
    settings: effective,
    fallbackOwner,
    scope: { channelId },
    channelName: ch?.name ?? channelId,
    guild,
    page,
  });
}
