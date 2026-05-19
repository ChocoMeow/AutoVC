import { z } from 'zod';
import { ConfigDefaultsSchema, type ConfigDefaults } from '@/config/defaults-schema.ts';

const ConfigSchema = z.object({
  runtime: z
    .object({
      enableDiscordBot: z.boolean().default(true),
      enableDashboard: z.boolean().default(false),
      logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    })
    .default({}),
  logging: z
    .object({
      directory: z.string().default('logs'),
      fileName: z.string().default('autovc.log'),
      maxHistory: z.number().int().min(1).max(365).default(7),
      maxFileSizeMb: z.number().min(1).max(1024).default(10),
      console: z.boolean().default(true),
    })
    .default({}),
  recovery: z
    .object({
      onStartup: z.boolean().default(true),
      /** Periodic sweep; 0 = disabled */
      intervalMinutes: z.number().min(0).max(1440).default(5),
      /** Pause between processing each guild */
      guildDelayMs: z.number().int().min(0).max(60_000).default(750),
      /** Minimum gap between queued Discord API tasks */
      taskDelayMs: z.number().int().min(0).max(10_000).default(350),
      maxRetries: z.number().int().min(0).max(20).default(5),
    })
    .default({}),
  channelNameRefresh: z
    .object({
      enabled: z.boolean().default(true),
      /** How often to re-evaluate temp channel names (0 = disabled). */
      intervalSeconds: z.number().int().min(0).max(3600).default(90),
      /** Discord sublimit: renames per channel per window. */
      maxRenamesPerChannel: z.number().int().min(1).max(2).default(2),
      windowMinutes: z.number().int().min(1).max(60).default(10),
      renameReason: z.string().min(1).max(512).default('AutoVC: update channel name'),
    })
    .default({}),
  discord: z.object({
    token: z.string().min(1),
    applicationId: z.string().min(1),
    guildId: z.string().optional(),
    /** never = manual script only | when-changed = deploy if command defs changed | always = every startup */
    deployCommands: z.enum(['never', 'when-changed', 'always']).default('never'),
  }),
  supabase: z.object({
    url: z.string().url(),
    anonKey: z.string().min(1),
    serviceRoleKey: z.string().optional(),
  }),
  defaults: ConfigDefaultsSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type { ConfigDefaults };

function applyEnvOverrides(json: Record<string, unknown>): void {
  const e = process.env;
  const set = (section: string, key: string, envKey: string) => {
    const v = e[`AUTOVC_${envKey}`];
    if (v !== undefined) {
      const sectionObj = (json[section] ??= {}) as Record<string, unknown>;
      sectionObj[key] = v;
    }
  };
  set('discord', 'token', 'DISCORD_TOKEN');
  set('discord', 'applicationId', 'DISCORD_APPLICATIONID');
  set('discord', 'guildId', 'DISCORD_GUILDID');
  set('discord', 'deployCommands', 'DISCORD_DEPLOYCOMMANDS');
  set('supabase', 'url', 'SUPABASE_URL');
  set('supabase', 'anonKey', 'SUPABASE_ANONKEY');
  set('supabase', 'serviceRoleKey', 'SUPABASE_SERVICEROLEKEY');
  set('runtime', 'logLevel', 'RUNTIME_LOGLEVEL');
  set('logging', 'directory', 'LOGGING_DIRECTORY');
  set('logging', 'maxHistory', 'LOGGING_MAXHISTORY');
}

export async function loadConfig(path = 'config.json'): Promise<Config> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Config file not found: ${path}. Copy config.example.json to config.json.`);
  }
  const json = (await file.json()) as Record<string, unknown>;
  applyEnvOverrides(json);

  const result = ConfigSchema.safeParse(json);
  if (!result.success) {
    console.error('Invalid config:', result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
