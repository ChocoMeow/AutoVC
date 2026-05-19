import {
  MessageFlags,
  type InteractionDeferReplyOptions,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from 'discord.js';

/** Components v2 panel on update/edit (ephemeral is set on the initial reply only). */
export const PANEL_EDIT_FLAGS: NonNullable<InteractionEditReplyOptions['flags']> =
  MessageFlags.IsComponentsV2;

/** Ephemeral Components v2 panel for the first reply. */
export const PANEL_REPLY_FLAGS: NonNullable<InteractionReplyOptions['flags']> =
  MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

/** Plain ephemeral text reply (no Components v2). */
export const EPHEMERAL_FLAGS: NonNullable<InteractionReplyOptions['flags']> = MessageFlags.Ephemeral;

export const EPHEMERAL_DEFER_FLAGS: NonNullable<InteractionDeferReplyOptions['flags']> =
  MessageFlags.Ephemeral;

/** Components v2 message posted or edited in a channel (e.g. temp voice chat panel). */
export const CHANNEL_V2_FLAGS = MessageFlags.IsComponentsV2 as const;
