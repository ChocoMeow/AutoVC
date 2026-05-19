import { ActivityType, type Presence } from 'discord.js';
import { getAppContext } from '@/app-context.ts';
import { defineEvent } from '@/discord/events/_loader.ts';
import { mergeSettingsForTemp } from '@/domain/settings/settings-merger.ts';
import { scheduleTempChannelNameRefresh } from '@/infra/channel-name-refresh-scheduler.ts';

function playingKey(presence: Presence | null): string {
  return (presence?.activities ?? [])
    .filter((a) => a.type === ActivityType.Playing)
    .map((a) => a.name)
    .sort()
    .join('\0');
}

export default defineEvent({
  name: 'presenceUpdate',
  async execute(oldPresence, newPresence) {
    if (playingKey(oldPresence) === playingKey(newPresence)) return;

    const member = newPresence.member;
    const channelId = member?.voice.channelId;
    if (!channelId) return;

    const app = getAppContext();
    const meta = app.tempRegistry.get(channelId);
    if (!meta) return;

    const settings = mergeSettingsForTemp(
      app.guildCache,
      app.creatorIndex,
      app.config.defaults.guild,
      meta,
    );
    if (
      !settings ||
      !app.templateEngine.templateNeedsPresenceRefresh(settings.channelNameTemplate)
    ) {
      return;
    }

    scheduleTempChannelNameRefresh(app, channelId);
  },
});
