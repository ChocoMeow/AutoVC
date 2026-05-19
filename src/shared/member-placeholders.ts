import type { GuildMember } from 'discord.js';

/** Highest-position role with hoist enabled (member list separator role). */
export function memberHoistRoleName(member: GuildMember): string {
  return member.roles.hoist?.name ?? '';
}

export function memberHighestRoleName(member: GuildMember): string {
  return member.roles.highest.name;
}
