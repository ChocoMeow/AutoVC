import { getAppContext } from '@/app-context.ts';
import { isAutoVcCustomId } from '@/discord/components/custom-ids.ts';
import { messagePanelReply } from '@/discord/components/creator-ui.ts';
import { EPHEMERAL_FLAGS } from '@/discord/components/ui-flags.ts';
import { defineEvent } from '@/discord/events/_loader.ts';
import { handleCreatorPanelInteraction } from '@/discord/handlers/creator-panel.handler.ts';
import { handleTempVoiceInteraction } from '@/discord/handlers/temp-voice-interaction.handler.ts';
import { isTempVoiceInteractionId } from '@/discord/components/temp-voice-ids.ts';
import { guildTranslator } from '@/i18n/guild-translator.ts';
import { formatDiscordErrorForUser } from '@/shared/bot-permissions.ts';

export default defineEvent({
  name: 'interactionCreate',
  async execute(interaction) {
    const { commands, logger } = getAppContext();

    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) return;

      const t = interaction.guild
        ? guildTranslator(getAppContext(), interaction.guild.id)
        : guildTranslator(getAppContext(), '');

      try {
        await command.execute(interaction);
      } catch (err) {
        logger.error({ err, command: interaction.commandName }, 'Command failed');
        const msg = messagePanelReply(
          t,
          t('errors.panelTitle'),
          formatDiscordErrorForUser(
            err,
            t('errors.runCommand', { command: interaction.commandName }),
            t,
          ),
        );
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => undefined);
        } else {
          await interaction.reply(msg).catch(() => undefined);
        }
      }
      return;
    }

    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isUserSelectMenu() ||
      interaction.isModalSubmit()
    ) {
      if (isTempVoiceInteractionId(interaction.customId)) {
        try {
          await handleTempVoiceInteraction(interaction);
        } catch (err) {
          const guildId = interaction.guild?.id ?? '';
          const t = guildTranslator(getAppContext(), guildId);
          getAppContext().logger.error(
            { err, customId: interaction.customId },
            'Temp voice interaction failed',
          );
          const msg = {
            content: `${formatDiscordErrorForUser(err, t('tempInterface.actionFailed'), t)}\n\n-# ${t('errors.panelReopen')}`,
            flags: EPHEMERAL_FLAGS,
          };
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp(msg).catch(() => undefined);
          } else {
            await interaction.reply(msg).catch(() => undefined);
          }
        }
        return;
      }

      if (!isAutoVcCustomId(interaction.customId)) return;
      if (interaction.isUserSelectMenu()) return;

      try {
        await handleCreatorPanelInteraction(interaction);
      } catch (err) {
        const guildId = interaction.guild?.id ?? '';
        const t = guildTranslator(getAppContext(), guildId);
        logger.error({ err, customId: interaction.customId }, 'Panel interaction failed');
        const msg = messagePanelReply(
          t,
          t('errors.panelTitle'),
          `${formatDiscordErrorForUser(err, t('errors.usePanel'), t)}\n\n-# ${t('errors.panelReopen')}`,
        );
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(msg).catch(() => undefined);
        } else if (interaction.isModalSubmit()) {
          await interaction.reply(msg).catch(() => undefined);
        } else {
          await interaction.reply(msg).catch(() => undefined);
        }
      }
    }
  },
});
