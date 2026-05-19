import { PermissionFlagsBits } from 'discord.js';

export function resolvePermissionFlags(names: readonly string[]): bigint {
  let bits = 0n;
  for (const name of names) {
    const flag = PermissionFlagsBits[name as keyof typeof PermissionFlagsBits];
    if (typeof flag === 'bigint') bits |= flag;
  }
  return bits;
}
