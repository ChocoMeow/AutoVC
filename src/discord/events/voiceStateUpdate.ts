import { getAppContext } from '@/app-context.ts';
import { defineEvent } from '@/discord/events/_loader.ts';

export default defineEvent({
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    const { voiceService } = getAppContext();
    await voiceService.handleStateChange(oldState, newState);
  },
});
