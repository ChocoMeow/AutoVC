const VC_BTN = 'autovc:vc:';
const VC_SEL = 'autovc:vcs:';
const VC_MOD = 'autovc:vcm:';

export type TempVcAction = 'rename' | 'delete' | 'delete_confirm' | 'refresh';

export const TempVcId = {
  button: (channelId: string, action: TempVcAction) => `${VC_BTN}${channelId}:${action}`,
  selectLimit: (channelId: string) => `${VC_SEL}${channelId}:limit`,
  selectRegion: (channelId: string) => `${VC_SEL}${channelId}:region`,
  selectMember: (channelId: string) => `${VC_SEL}${channelId}:member`,
  modalRename: (channelId: string) => `${VC_MOD}${channelId}:rename`,
} as const;

export function isTempVoiceInteractionId(id: string): boolean {
  return id.startsWith(VC_BTN) || id.startsWith(VC_SEL) || id.startsWith(VC_MOD);
}

export function parseTempVcChannelId(id: string): string | null {
  if (id.startsWith(VC_BTN)) return id.slice(VC_BTN.length).split(':')[0] ?? null;
  if (id.startsWith(VC_SEL)) return id.slice(VC_SEL.length).split(':')[0] ?? null;
  if (id.startsWith(VC_MOD)) return id.slice(VC_MOD.length).split(':')[0] ?? null;
  return null;
}

export function parseTempVcButton(id: string): { channelId: string; action: TempVcAction } | null {
  if (!id.startsWith(VC_BTN)) return null;
  const rest = id.slice(VC_BTN.length);
  const sep = rest.indexOf(':');
  if (sep === -1) return null;
  return { channelId: rest.slice(0, sep), action: rest.slice(sep + 1) as TempVcAction };
}

export function parseTempVcSelectKind(
  id: string,
): { channelId: string; kind: 'limit' | 'region' | 'member' } | null {
  if (!id.startsWith(VC_SEL)) return null;
  const rest = id.slice(VC_SEL.length);
  const sep = rest.indexOf(':');
  if (sep === -1) return null;
  const kind = rest.slice(sep + 1);
  if (kind !== 'limit' && kind !== 'region' && kind !== 'member') return null;
  return { channelId: rest.slice(0, sep), kind };
}

export type TempVcMemberAction = 'kick' | 'block' | 'transfer';

export function parseTempVcMemberSelectValue(
  value: string,
): { action: TempVcMemberAction; userId: string } | null {
  const sep = value.indexOf(':');
  if (sep === -1) return null;
  const action = value.slice(0, sep);
  const userId = value.slice(sep + 1);
  if (action !== 'kick' && action !== 'block' && action !== 'transfer') return null;
  if (!userId) return null;
  return { action, userId };
}

export function parseTempVcModalRename(id: string): string | null {
  if (!id.startsWith(VC_MOD) || !id.endsWith(':rename')) return null;
  const inner = id.slice(VC_MOD.length, -':rename'.length);
  return inner || null;
}
