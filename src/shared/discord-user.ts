import type { User } from 'discord.js';

export function formatUserTag(user: User): string {
  return user.discriminator === '0' ? user.username : `${user.username}#${user.discriminator}`;
}
