import type { SettingsScope } from '@/discord/components/settings-scope.ts';
import { scopeKey } from '@/discord/components/settings-scope.ts';
import type { SETTING_SELECT_KINDS } from '@/discord/components/custom-ids.ts';

export type SettingsSubpage = 'hub' | 'permissions' | 'voice' | 'behavior' | 'chat' | 'modlog' | 'general';

const PREFIX = 'autovc:sp:';

export function settingsPageId(scope: SettingsScope, page: SettingsSubpage): string {
  return `${PREFIX}${scopeKey(scope)}:${page}`;
}

export function parseSettingsPageId(id: string): { scope: SettingsScope; page: SettingsSubpage } | null {
  if (!id.startsWith(PREFIX)) return null;
  const rest = id.slice(PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep === -1) return null;

  const scopePart = rest.slice(0, sep);
  const page = rest.slice(sep + 1) as SettingsSubpage;
  const valid: SettingsSubpage[] = ['hub', 'permissions', 'voice', 'behavior', 'chat', 'modlog', 'general'];
  if (!valid.includes(page)) return null;

  const scope: SettingsScope = scopePart === 'g' ? 'guild' : { channelId: scopePart };
  return { scope, page };
}

export function subpageForSelectKind(
  kind: (typeof SETTING_SELECT_KINDS)[number],
): SettingsSubpage {
  switch (kind) {
    case 'ss':
    case 'so':
      return 'permissions';
    case 'br':
    case 'ul':
    case 'rg':
      return 'voice';
    case 'sd':
    case 'mc':
    case 'tp':
    case 'tc':
      return 'behavior';
    case 'ie':
      return 'chat';
    case 'ml':
      return 'modlog';
    case 'ln':
      return 'general';
    default:
      return 'hub';
  }
}

export function guildOnlySubpage(page: SettingsSubpage): boolean {
  return page === 'modlog' || page === 'general';
}
