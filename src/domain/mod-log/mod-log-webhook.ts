import {
  WebhookClient,
  type Client,
  type Guild,
  type TextChannel,
} from 'discord.js';
import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';

export const MOD_LOG_WEBHOOK_NAME = 'AutoVC Logs';

export interface ModLogWebhookCredentials {
  modLogWebhookId: string;
  modLogWebhookToken: string;
}

export function createModLogWebhookClient(credentials: ModLogWebhookCredentials): WebhookClient {
  return new WebhookClient({
    id: credentials.modLogWebhookId,
    token: credentials.modLogWebhookToken,
  });
}

export async function deleteModLogWebhook(
  client: Client,
  webhookId: string | null | undefined,
  webhookToken: string | null | undefined,
): Promise<void> {
  if (!webhookId || !webhookToken) return;

  try {
    const hook = new WebhookClient({ id: webhookId, token: webhookToken });
    await hook.delete('AutoVC: log channel changed or logging disabled');
    hook.destroy();
  } catch {
    try {
      await client.rest.delete(`/webhooks/${webhookId}`);
    } catch {
      // Webhook may already be gone.
    }
  }
}

function resolveLogTextChannel(guild: Guild, channelId: string): TextChannel | null {
  const channel = guild.channels.cache.get(channelId);
  if (!channel?.isTextBased() || channel.isDMBased()) return null;
  return channel as TextChannel;
}

/**
 * Creates or rotates the mod-log webhook when the log channel changes.
 * Returns settings fields to persist (channel id + webhook credentials).
 */
export async function syncModLogWebhook(
  client: Client,
  guild: Guild,
  current: GuildSettingsRecord,
  nextChannelId: string | null,
): Promise<Partial<GuildSettingsRecord>> {
  if (nextChannelId === current.modLogChannelId && current.modLogWebhookId && current.modLogWebhookToken) {
    return { modLogChannelId: nextChannelId };
  }

  await deleteModLogWebhook(client, current.modLogWebhookId, current.modLogWebhookToken);

  if (!nextChannelId) {
    return {
      modLogChannelId: null,
      modLogWebhookId: null,
      modLogWebhookToken: null,
    };
  }

  const textChannel = resolveLogTextChannel(guild, nextChannelId);
  if (!textChannel) {
    return {
      modLogChannelId: null,
      modLogWebhookId: null,
      modLogWebhookToken: null,
    };
  }

  try {
    const webhook = await textChannel.createWebhook({
      name: MOD_LOG_WEBHOOK_NAME,
      avatar: client.user?.displayAvatarURL({ size: 128 }),
      reason: 'AutoVC moderation logs',
    });

    if (!webhook.token) {
      await webhook.delete('AutoVC: webhook token missing').catch(() => undefined);
      return {
        modLogChannelId: null,
        modLogWebhookId: null,
        modLogWebhookToken: null,
      };
    }

    return {
      modLogChannelId: nextChannelId,
      modLogWebhookId: webhook.id,
      modLogWebhookToken: webhook.token,
    };
  } catch {
    return {
      modLogChannelId: null,
      modLogWebhookId: null,
      modLogWebhookToken: null,
    };
  }
}

/** Ensures a webhook exists for the configured log channel (lazy repair). */
export async function ensureModLogWebhook(
  client: Client,
  guild: Guild,
  settings: GuildSettingsRecord,
): Promise<Partial<GuildSettingsRecord> | null> {
  if (!settings.modLogChannelId) return null;

  if (settings.modLogWebhookId && settings.modLogWebhookToken) {
    return null;
  }

  return syncModLogWebhook(client, guild, {
    ...settings,
    modLogWebhookId: null,
    modLogWebhookToken: null,
  }, settings.modLogChannelId);
}

export function isModLogWebhookMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: number }).code;
  return code === 10015 || code === 50027 || code === 10003;
}
