import type {
  ButtonInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';

type PanelPayload = InteractionEditReplyOptions | InteractionReplyOptions;

type PanelInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

export async function replyPanelPayload(
  interaction: PanelInteraction,
  payload: PanelPayload,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload as InteractionEditReplyOptions).catch(() => undefined);
    return;
  }
  if (interaction.isModalSubmit()) {
    await interaction.reply(payload as InteractionReplyOptions).catch(() => undefined);
    return;
  }
  await interaction
    .update(payload as InteractionEditReplyOptions)
    .catch(() => interaction.reply(payload as InteractionReplyOptions).catch(() => undefined));
}
