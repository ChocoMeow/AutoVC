import {
  ContainerBuilder,
  SeparatorBuilder,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
} from 'discord.js';
import { PANEL_EDIT_FLAGS, PANEL_REPLY_FLAGS } from '@/discord/components/ui-flags.ts';

export const ACCENT_GUILD = 0x5865f2;
export const ACCENT_SETTINGS_HOME = 0x57f287;
export const ACCENT_CREATOR = 0x9b59b6;

export function sectionDivider(): SeparatorBuilder {
  return new SeparatorBuilder().setDivider(true);
}

export function panelEdit(containers: ContainerBuilder[]): InteractionEditReplyOptions {
  return { components: containers, flags: PANEL_EDIT_FLAGS };
}

export function panelReply(containers: ContainerBuilder[]): InteractionReplyOptions {
  return { components: containers, flags: PANEL_REPLY_FLAGS };
}

function titledContent(title: string, body: string): string {
  return `# ${title}\n\n${body}`;
}

export function permissionDeniedPayload(title: string, body: string): InteractionReplyOptions {
  return {
    components: [
      new ContainerBuilder().addTextDisplayComponents((c) =>
        c.setContent(titledContent(title, body)),
      ),
    ],
    flags: PANEL_REPLY_FLAGS,
  };
}

export function permissionDeniedEditPayload(title: string, body: string): InteractionEditReplyOptions {
  return {
    components: [
      new ContainerBuilder().addTextDisplayComponents((c) =>
        c.setContent(titledContent(title, body)),
      ),
    ],
    flags: PANEL_EDIT_FLAGS,
  };
}
