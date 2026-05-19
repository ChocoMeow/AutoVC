import type { Client } from 'discord.js';
import type { Config } from '@/config/load.ts';
import type { TemplateEngine } from '@/domain/naming/template-engine.ts';
import type { ModLogService } from '@/domain/mod-log/mod-log.service.ts';
import type { VoiceChannelService } from '@/domain/voice/voice-channel.service.ts';
import type { BotCommand } from '@/discord/commands/_loader.ts';
import type { CreatorChannelIndex } from '@/infra/cache/creator-channel-index.ts';
import type { GuildConfigCache } from '@/infra/cache/guild-config-cache.ts';
import type { TempChannelRegistry } from '@/infra/cache/temp-channel-registry.ts';
import type { CreatorChannelRepository } from '@/infra/repositories/creator-channel.repo.ts';
import type { GuildConfigRepository } from '@/infra/repositories/guild-config.repo.ts';
import type { TempChannelRepository } from '@/infra/repositories/temp-channel.repo.ts';
import type { DiscordTaskQueue } from '@/infra/discord-task-queue.ts';
import type { Logger } from '@/shared/logger.ts';

export interface AppContext {
  config: Config;
  client: Client;
  logger: Logger;
  guildCache: GuildConfigCache;
  creatorIndex: CreatorChannelIndex;
  tempRegistry: TempChannelRegistry;
  guildConfigRepo: GuildConfigRepository;
  creatorRepo: CreatorChannelRepository;
  tempRepo: TempChannelRepository;
  templateEngine: TemplateEngine;
  voiceService: VoiceChannelService;
  modLogService: ModLogService;
  discordQueue: DiscordTaskQueue;
  commands: Map<string, BotCommand>;
}

let ctx: AppContext | null = null;

export function setAppContext(context: AppContext): void {
  ctx = context;
}

export function getAppContext(): AppContext {
  if (!ctx) throw new Error('App context not initialized');
  return ctx;
}
