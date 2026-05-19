import type { GuildBasedChannel, GuildMember, MessageCreateOptions } from 'discord.js';
import type { AppContext } from '@/app-context.ts';
import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';
import { buildModLogTemplateContext } from '@/domain/naming/build-template-context.ts';
import type { ModLogChannelKind } from '@/domain/mod-log/channel-kind.ts';
import {
  modLogTemplateValue,
  type ModLogEvent,
} from '@/domain/mod-log/types.ts';
import {
  createModLogWebhookClient,
  ensureModLogWebhook,
  isModLogWebhookMissingError,
  syncModLogWebhook,
} from '@/domain/mod-log/mod-log-webhook.ts';

/** Never ping users/roles/channels from mod-log text (even if templates use mention syntax). */
const MOD_LOG_MESSAGE_OPTIONS = {
  allowedMentions: { parse: [] },
} satisfies Pick<MessageCreateOptions, 'allowedMentions'>;

export type { ModLogChannelKind };

export class ModLogService {
  constructor(private readonly app: AppContext) {}

  logCreate(
    guildId: string,
    settings: GuildSettingsRecord,
    channel: GuildBasedChannel,
    kind: ModLogChannelKind,
    user?: GuildMember | null,
    creatorChannelId?: string,
  ): void {
    void this.send(guildId, settings, 'create', {
      guild: channel.guild ?? this.app.client.guilds.cache.get(guildId)!,
      channel,
      channelKind: kind,
      user,
      creatorChannelId,
    });
  }

  logUpdate(
    guildId: string,
    settings: GuildSettingsRecord,
    channel: GuildBasedChannel,
    kind: ModLogChannelKind,
    oldName: string,
    newName: string,
    user?: GuildMember | null,
    creatorChannelId?: string,
  ): void {
    void this.send(guildId, settings, 'update', {
      guild: channel.guild ?? this.app.client.guilds.cache.get(guildId)!,
      channel,
      channelKind: kind,
      user,
      creatorChannelId,
      oldName,
      newName,
    });
  }

  logDelete(
    guildId: string,
    settings: GuildSettingsRecord,
    channel: GuildBasedChannel,
    kind: ModLogChannelKind,
    user?: GuildMember | null,
    creatorChannelId?: string,
  ): void {
    void this.send(guildId, settings, 'delete', {
      guild: channel.guild ?? this.app.client.guilds.cache.get(guildId)!,
      channel,
      channelKind: kind,
      user,
      creatorChannelId,
    });
  }

  logJoin(
    guildId: string,
    settings: GuildSettingsRecord,
    channel: GuildBasedChannel,
    user: GuildMember,
    creatorChannelId?: string,
  ): void {
    void this.send(guildId, settings, 'join', {
      guild: channel.guild ?? this.app.client.guilds.cache.get(guildId)!,
      channel,
      channelKind: 'temp',
      user,
      creatorChannelId,
    });
  }

  logLeave(
    guildId: string,
    settings: GuildSettingsRecord,
    channel: GuildBasedChannel,
    user: GuildMember,
    creatorChannelId?: string,
  ): void {
    void this.send(guildId, settings, 'leave', {
      guild: channel.guild ?? this.app.client.guilds.cache.get(guildId)!,
      channel,
      channelKind: 'temp',
      user,
      creatorChannelId,
    });
  }

  private async send(
    guildId: string,
    settings: GuildSettingsRecord,
    event: ModLogEvent,
    input: Parameters<typeof buildModLogTemplateContext>[2],
  ): Promise<void> {
    if (!settings.modLogChannelId) return;

    const guild = this.app.client.guilds.cache.get(guildId);
    if (!guild) return;

    const template = modLogTemplateValue(settings, event);
    const ctx = buildModLogTemplateContext(settings, event, input);
    const content = (await this.app.templateEngine.render(template, ctx)).trim();
    if (!content) return;

    try {
      await this.deliverViaWebhook(guildId, settings, content);
    } catch (err) {
      this.app.logger.warn({ err, guildId, event }, 'Mod log send failed');
    }
  }

  private async deliverViaWebhook(
    guildId: string,
    settings: GuildSettingsRecord,
    content: string,
  ): Promise<void> {
    const guild = this.app.client.guilds.cache.get(guildId);
    if (!guild) return;

    const payload = {
      content: content.slice(0, 2000),
      ...MOD_LOG_MESSAGE_OPTIONS,
    };

    let active = await this.resolveWebhookSettings(guildId, guild, settings);
    const credentials = this.webhookCredentials(active);
    if (!credentials) return;

    const webhook = createModLogWebhookClient(credentials);

    try {
      await webhook.send(payload);
    } catch (err) {
      if (!isModLogWebhookMissingError(err)) throw err;

      const rotated = await syncModLogWebhook(this.app.client, guild, active, active.modLogChannelId);
      active = await this.persistWebhookPatch(guildId, active, rotated);
      const retryCredentials = this.webhookCredentials(active);
      if (!retryCredentials) return;

      const retryWebhook = createModLogWebhookClient(retryCredentials);
      try {
        await retryWebhook.send(payload);
      } finally {
        retryWebhook.destroy();
      }
    } finally {
      webhook.destroy();
    }
  }

  private async resolveWebhookSettings(
    guildId: string,
    guild: NonNullable<ReturnType<AppContext['client']['guilds']['cache']['get']>>,
    settings: GuildSettingsRecord,
  ): Promise<GuildSettingsRecord> {
    if (this.webhookCredentials(settings)) return settings;

    const patch = await ensureModLogWebhook(this.app.client, guild, settings);
    if (!patch) return settings;

    return this.persistWebhookPatch(guildId, settings, patch);
  }

  private async persistWebhookPatch(
    guildId: string,
    settings: GuildSettingsRecord,
    patch: Partial<GuildSettingsRecord>,
  ): Promise<GuildSettingsRecord> {
    if (!Object.keys(patch).length) return settings;

    const updated = await this.app.guildConfigRepo.updateSettings(guildId, patch);
    this.app.guildCache.set(guildId, updated);
    return updated;
  }

  private webhookCredentials(
    settings: GuildSettingsRecord,
  ): { modLogWebhookId: string; modLogWebhookToken: string } | null {
    if (!settings.modLogWebhookId || !settings.modLogWebhookToken) return null;
    return {
      modLogWebhookId: settings.modLogWebhookId,
      modLogWebhookToken: settings.modLogWebhookToken,
    };
  }
}
