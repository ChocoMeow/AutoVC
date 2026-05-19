import { getAppContext } from '@/app-context.ts';
import { defineEvent } from '@/discord/events/_loader.ts';

export default defineEvent({
  name: 'channelDelete',
  async execute(channel) {
    if (!('guild' in channel) || !channel.guild) return;

    const { voiceService } = getAppContext();
    await voiceService.handleChannelDeleted(channel.id, channel.guild.id, {
      name: channel.name,
      type: channel.type,
    });
  },
});
