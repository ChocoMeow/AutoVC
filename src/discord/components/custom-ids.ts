import { isModLogEvent, type ModLogEvent } from '@/domain/mod-log/types.ts';

const PREFIX = 'autovc:';

export const CustomId = {
  main: `${PREFIX}m`,
  create: `${PREFIX}c`,
  removeMenu: `${PREFIX}r`,
  removeDo: (channelId: string) => `${PREFIX}rd:${channelId}`,
  list: `${PREFIX}l`,
  settings: `${PREFIX}s`,
  settingsGuild: `${PREFIX}sg`,
  removeSelect: `${PREFIX}remove-select`,
  settingsCreatorSelect: `${PREFIX}settings-creator-select`,
  modalTemplateGuild: `${PREFIX}mt:g`,
  modalTemplateCreator: (channelId: string) => `${PREFIX}mt:${channelId}`,
  editTemplateGuild: `${PREFIX}et:g`,
  editTemplateCreator: (channelId: string) => `${PREFIX}et:${channelId}`,
  editModLogTemplate: (event: ModLogEvent) => `${PREFIX}eml:${event}`,
  modalModLogTemplate: (event: ModLogEvent) => `${PREFIX}mml:${event}`,
  editGreeting: (scopeKey: string) => `${PREFIX}eg:${scopeKey}`,
  modalGreeting: (scopeKey: string) => `${PREFIX}mg:${scopeKey}`,
} as const;

/** Setting select kinds — paired with {@link parseScopedSelectId} from settings-scope.ts */
export const SETTING_SELECT_KINDS = ['ss', 'so', 'sd', 'br', 'ul', 'rg', 'mc', 'tp', 'tc', 'ml', 'ln', 'ie'] as const;

export type { ModLogEvent };

export function isAutoVcCustomId(id: string): boolean {
  return id.startsWith(PREFIX);
}

export function parseRemoveDoId(id: string): string | null {
  if (!id.startsWith(`${PREFIX}rd:`)) return null;
  return id.slice(`${PREFIX}rd:`.length);
}

function parseSuffixId<T>(
  id: string,
  prefix: string,
  parse: (suffix: string) => T | undefined,
): T | undefined {
  if (!id.startsWith(prefix)) return undefined;
  return parse(id.slice(prefix.length));
}

/** `null` = guild scope; `undefined` = not a template-edit id. */
export function parseEditTemplateChannelId(id: string): string | null | undefined {
  if (id === CustomId.editTemplateGuild) return null;
  return parseSuffixId(id, `${PREFIX}et:`, (channelId) => (channelId === 'g' ? null : channelId));
}

/** `null` = guild scope; `undefined` = not a template modal id. */
export function parseModalTemplateChannelId(id: string): string | null | undefined {
  if (id === CustomId.modalTemplateGuild) return null;
  return parseSuffixId(id, `${PREFIX}mt:`, (channelId) => (channelId === 'g' ? null : channelId));
}

export function parseModalModLogEvent(id: string): ModLogEvent | undefined {
  return parseSuffixId(id, `${PREFIX}mml:`, (event) => (isModLogEvent(event) ? event : undefined));
}

export function parseEditModLogEvent(id: string): ModLogEvent | undefined {
  return parseSuffixId(id, `${PREFIX}eml:`, (event) => (isModLogEvent(event) ? event : undefined));
}

export function parseEditGreetingScopeKey(id: string): string | null {
  if (!id.startsWith(`${PREFIX}eg:`)) return null;
  return id.slice(`${PREFIX}eg:`.length) || null;
}

export function parseModalGreetingScopeKey(id: string): string | null {
  if (!id.startsWith(`${PREFIX}mg:`)) return null;
  return id.slice(`${PREFIX}mg:`.length) || null;
}
