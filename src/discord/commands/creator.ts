import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { BotCommand } from '@/discord/commands/_loader.ts';
import { openCreatorPanel } from '@/discord/handlers/creator-panel.handler.ts';
import { createTranslator } from '@/i18n/translator.ts';

const tEn = createTranslator('en');
const tZh = createTranslator('zh-TW');

export default {
  data: new SlashCommandBuilder()
    .setName('creator')
    .setDescription(tEn('command.creatorDescription'))
    .setDescriptionLocalizations({
      'zh-TW': tZh('command.creatorDescription'),
    })
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  execute: openCreatorPanel,
} satisfies BotCommand;
