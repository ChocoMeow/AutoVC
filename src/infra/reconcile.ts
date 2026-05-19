import type { AppContext } from '@/app-context.ts';

export async function reconcile(app: AppContext): Promise<void> {
  const { client, creatorRepo, tempRepo, creatorIndex, tempRegistry, guildCache, guildConfigRepo, logger } =
    app;

  const creators = await creatorRepo.findAll();
  creatorIndex.rebuild(creators);

  for (const row of creators) {
    const guildRow = await guildConfigRepo.findById(row.guild_id);
    if (guildRow?.enabled) {
      guildCache.set(row.guild_id, guildRow.settings);
    }
  }

  const tempRows = await tempRepo.findAll();
  let stale = 0;
  let active = 0;

  for (const row of tempRows) {
    const guild = client.guilds.cache.get(row.guild_id);
    const exists = guild?.channels.cache.has(row.channel_id);

    if (exists) {
      tempRegistry.registerFromRow(row);
      active++;
    } else {
      await tempRepo.delete(row.channel_id);
      stale++;
    }
  }

  logger.info(
    { creators: creators.length, activeTemps: active, staleTempsRemoved: stale },
    'Reconciliation complete',
  );
}
