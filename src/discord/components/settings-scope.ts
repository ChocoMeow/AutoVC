/** Guild (`g`) or creator channel snowflake for scoped settings controls. */
export type SettingsScope = 'guild' | { channelId: string };

export function scopeKey(scope: SettingsScope): string {
  return scope === 'guild' ? 'g' : scope.channelId;
}

export function scopedSelectId(kind: string, scope: SettingsScope): string {
  return `autovc:${kind}:${scopeKey(scope)}`;
}

export function parseScopedSelectId(id: string, kind: string): SettingsScope | null {
  const prefix = `autovc:${kind}:`;
  if (!id.startsWith(prefix)) return null;
  const rest = id.slice(prefix.length);
  return rest === 'g' ? 'guild' : { channelId: rest };
}
