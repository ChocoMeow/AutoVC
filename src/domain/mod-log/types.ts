import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';

export const MOD_LOG_EVENTS = ['create', 'update', 'delete', 'join', 'leave'] as const;
export type ModLogEvent = (typeof MOD_LOG_EVENTS)[number];

export type { ModLogChannelKind } from '@/domain/mod-log/channel-kind.ts';

export const MOD_LOG_DEFAULT_TEMPLATES = {
  create:
    'Voice channel created: {newchannel.mention} (`{newchannel.id}`) via {creatorchannel.mention} (`{creatorchannel.id}`) · {creator.displayName} ({creator.name})',
  update:
    'Channel renamed: {oldchannel.mention} (`{oldchannel.id}`) → {newchannel.mention} · {creator.displayName}',
  delete:
    'Voice channel deleted: {oldchannel.name} (`{oldchannel.id}`) · {creator.displayName} ({creator.name})',
  join: 'Joined {newchannel.mention} · {creator.displayName} ({creator.name})',
  leave: 'Left {oldchannel.mention} · {creator.displayName} ({creator.name})',
} as const;

const TEMPLATE_KEY = {
  create: 'modLogTemplateCreate',
  update: 'modLogTemplateUpdate',
  delete: 'modLogTemplateDelete',
  join: 'modLogTemplateJoin',
  leave: 'modLogTemplateLeave',
} as const satisfies Record<ModLogEvent, keyof GuildSettingsRecord>;

export function isModLogEvent(value: string): value is ModLogEvent {
  return (MOD_LOG_EVENTS as readonly string[]).includes(value);
}

export function modLogTemplateValue(settings: GuildSettingsRecord, event: ModLogEvent): string {
  return settings[TEMPLATE_KEY[event]];
}

export function modLogTemplatePatch(event: ModLogEvent, template: string): Partial<GuildSettingsRecord> {
  return { [TEMPLATE_KEY[event]]: template };
}
