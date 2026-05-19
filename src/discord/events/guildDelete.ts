import { getAppContext } from '@/app-context.ts';
import { defineEvent } from '@/discord/events/_loader.ts';

export default defineEvent({
  name: 'guildDelete',
  async execute(guild) {
    const { guildCache, creatorIndex, tempRegistry, voiceService } = getAppContext();

    guildCache.purgeGuild(guild.id);
    creatorIndex.purgeGuild(guild.id);
    tempRegistry.purgeGuild(guild.id);
    voiceService.releaseGuild(guild.id);
  },
});
