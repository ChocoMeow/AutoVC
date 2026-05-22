const VC_BTN = 'autovc:vc:';
const VC_SEL = 'autovc:vcs:';
const VC_USR = 'autovc:vcu:';
const VC_MOD = 'autovc:vcm:';

export type TempVcAction = 'rename' | 'delete' | 'delete_confirm' | 'refresh';

export type TempVcMemberAction = 'kick' | 'block' | 'transfer';

export const TempVcId = {
  button: (channelId: string, action: TempVcAction) => `${VC_BTN}${channelId}:${action}`,
  memberAction: (channelId: string, userId: string, action: TempVcMemberAction) =>
    `${VC_BTN}${channelId}:m:${userId}:${action}`,
  selectLimit: (channelId: string) => `${VC_SEL}${channelId}:limit`,
  selectRegion: (channelId: string) => `${VC_SEL}${channelId}:region`,
  selectMember: (channelId: string) => `${VC_USR}${channelId}:pick`,
  modalRename: (channelId: string) => `${VC_MOD}${channelId}:rename`,
} as const;

export function isTempVoiceInteractionId(id: string): boolean {
  return (
    id.startsWith(VC_BTN) ||
    id.startsWith(VC_SEL) ||
    id.startsWith(VC_USR) ||
    id.startsWith(VC_MOD)
  );
}

export function parseTempVcChannelId(id: string): string | null {
  if (id.startsWith(VC_BTN)) return id.slice(VC_BTN.length).split(':')[0] ?? null;
  if (id.startsWith(VC_SEL)) return id.slice(VC_SEL.length).split(':')[0] ?? null;
  if (id.startsWith(VC_USR)) return id.slice(VC_USR.length).split(':')[0] ?? null;
  if (id.startsWith(VC_MOD)) return id.slice(VC_MOD.length).split(':')[0] ?? null;
  return null;
}

export function parseTempVcButton(id: string): { channelId: string; action: TempVcAction } | null {
  if (!id.startsWith(VC_BTN)) return null;
  const rest = id.slice(VC_BTN.length);
  const sep = rest.indexOf(':');
  if (sep === -1) return null;
  const action = rest.slice(sep + 1);
  if (action === 'm' || rest.includes(':m:')) return null;
  return { channelId: rest.slice(0, sep), action: action as TempVcAction };
}

export function parseTempVcMemberActionButton(
  id: string,
): { channelId: string; userId: string; action: TempVcMemberAction } | null {
  if (!id.startsWith(VC_BTN)) return null;
  const parts = id.slice(VC_BTN.length).split(':');
  if (parts.length !== 4 || parts[1] !== 'm') return null;
  const action = parts[3];
  if (action !== 'kick' && action !== 'block' && action !== 'transfer') return null;
  if (!parts[0] || !parts[2]) return null;
  return { channelId: parts[0], userId: parts[2], action };
}

export function parseTempVcSelectKind(
  id: string,
): { channelId: string; kind: 'limit' | 'region' } | null {
  if (!id.startsWith(VC_SEL)) return null;
  const rest = id.slice(VC_SEL.length);
  const sep = rest.indexOf(':');
  if (sep === -1) return null;
  const kind = rest.slice(sep + 1);
  if (kind !== 'limit' && kind !== 'region') return null;
  return { channelId: rest.slice(0, sep), kind };
}

export function isTempVcMemberPickId(id: string): boolean {
  return id.startsWith(VC_USR) && id.endsWith(':pick');
}

export function parseTempVcModalRename(id: string): string | null {
  if (!id.startsWith(VC_MOD) || !id.endsWith(':rename')) return null;
  const inner = id.slice(VC_MOD.length, -':rename'.length);
  return inner || null;
}
