# AutoVC — High-Performance Temporary Voice Bot

> **Runtime:** Bun 1.3+ · **Discord:** discord.js v14 · **Database:** Supabase · **Language:** TypeScript

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Core Philosophy](#2-core-philosophy)
3. [Technical Stack](#3-technical-stack)
4. [Configuration System](#4-configuration-system)
5. [Architecture](#5-architecture)
6. [Directory Layout](#6-directory-layout)
7. [Auto-Loading Registries](#7-auto-loading-registries)
8. [Database Schema](#8-database-schema)
9. [Guild Settings System](#9-guild-settings-system)
10. [Naming Engine](#10-naming-engine)
11. [Caching Strategy](#11-caching-strategy)
12. [Voice Lifecycle](#12-voice-lifecycle)
13. [Slash Commands](#13-slash-commands)
14. [Security & Operations](#14-security--operations)
15. [Implementation Phases](#15-implementation-phases)
16. [Manual Test Plan](#16-manual-test-plan)
17. [Task Tracker](#17-task-tracker)

---

## 1. Project Overview

AutoVC is a **modular, zero-bloat Discord bot** for automatic temporary voice channels. Administrators mark one or more "creator" channels; when any user joins one, the bot instantly spawns a private temp channel and moves them in. The channel self-destructs when it empties.

**Goals:**

- **Zero-latency channel creation** — join → channel up → member moved in one async chain.
- **Per-guild isolation** — every server has its own settings row; no shared mutable state across guilds.
- **Minimum code surface** — every file does one thing; adding a feature means adding a file, not editing five.
- **Human-readable config** — `config.json` is the primary control surface for the bot admin; `.env` is an optional override layer for CI/production secrets.
- **Extensible by convention** — events, commands, and placeholders are auto-discovered from directories; no manual registration arrays to maintain.

---

## 2. Core Philosophy

> **"Adding a feature = adding a file. Not editing five."**

Every design decision is filtered through one question: _will this make future changes require touching fewer files?_ This leads to three concrete patterns used throughout the codebase:

### 2.1 Auto-Loading Over Manual Registration

Do not maintain arrays of imports. Instead, scan directories at startup and dynamically import anything that matches a contract interface. The registry does the work; you just drop a file in the right folder.

```
# Adding a new slash command:
touch src/discord/commands/mycommand.ts   ← done. No other file changes.

# Adding a new placeholder:
touch src/domain/naming/placeholders/builtin/mytoken.ts   ← done.

# Adding a new Discord event handler:
touch src/discord/events/myevent.ts   ← done.
```

### 2.2 One Schema = One Source of Truth

Zod schemas are the single definition for types, defaults, validation, and error messages. Never write a separate TypeScript `type` or `interface` for anything that has a Zod schema — use `z.infer<>` instead.

### 2.3 Thin Adapters, Fat Services

Discord event files are adapters. They extract data and call a domain service. They contain zero business logic. This means the entire voice channel lifecycle can be unit-tested without a Discord client.

```
event file role:    receive Discord event → extract relevant data → call service method
service role:       all business logic, cache reads, DB writes, naming, error handling
```

---

## 3. Technical Stack

| Layer           | Technology             | Rationale                                                                        |
| --------------- | ---------------------- | -------------------------------------------------------------------------------- |
| **Runtime**     | Bun 1.3+               | Native TS, fast cold start, built-in `.env` reader, `Bun.file()` for JSON config |
| **Discord**     | discord.js `^14.26`    | Gateway v10, minimal intents                                                     |
| **Database**    | Supabase (Postgres 15) | Managed Postgres, RLS, future Auth + Realtime                                    |
| **Validation**  | Zod `^3`               | Single source of truth for all schemas                                           |
| **Logging**     | `pino`                 | Structured JSON; `pino-pretty` in dev only                                       |
| **Concurrency** | `async-mutex`          | Per-guild mutex for burst-join counter safety                                    |

**Optional later:** `hono` (dashboard API), `pino-pretty` (dev logging).

---

## 4. Configuration System

### 4.1 Design

The bot is controlled by **`config.json`** — a human-friendly file the bot admin edits directly. It lives at the project root and is the **primary** source for all bot-level settings.

**`.env`** is a **secondary override layer** for values the admin wants to keep outside the JSON file — typically secrets in a production/CI environment. If a value exists in both, `.env` wins.

```
Priority (low → high):
  Built-in defaults  →  config.json  →  .env overrides
```

This means the bot runs fully from `config.json` alone. `.env` is never required.

### 4.2 `config.json` Structure

```jsonc
// config.json  (gitignored — copy from config.example.json)
{
    "runtime": {
        "enableDiscordBot": true, // set false to run without Discord (e.g. dashboard-only)
        "enableDashboard": false, // Phase 3: Hono API server
        "logLevel": "info", // "trace" | "debug" | "info" | "warn" | "error"
    },
    "discord": {
        "token": "BOT_TOKEN_HERE",
        "applicationId": "APP_ID_HERE",
        "guildId": "", // optional: dev guild for instant /command refresh
    },
    "supabase": {
        "url": "https://YOUR_PROJECT.supabase.co",
        "anonKey": "YOUR_ANON_KEY",
        "serviceRoleKey": "", // optional: required for admin ops that bypass RLS
    },
}
```

> **`config.example.json`** is committed to the repo with placeholder strings. **`config.json`** is gitignored. Copy example → real on first setup.

### 4.3 `.env` Override Keys

Any `config.json` value can be overridden via a flat `.env` key using the prefix `AUTOVC_`.

| `.env` key                       | Overrides config path     |
| -------------------------------- | ------------------------- |
| `AUTOVC_DISCORD_TOKEN`           | `discord.token`           |
| `AUTOVC_DISCORD_APPLICATIONID`   | `discord.applicationId`   |
| `AUTOVC_DISCORD_GUILDID`         | `discord.guildId`         |
| `AUTOVC_SUPABASE_URL`            | `supabase.url`            |
| `AUTOVC_SUPABASE_ANONKEY`        | `supabase.anonKey`        |
| `AUTOVC_SUPABASE_SERVICEROLEKEY` | `supabase.serviceRoleKey` |
| `AUTOVC_RUNTIME_LOGLEVEL`        | `runtime.logLevel`        |

**Typical local setup:** everything in `config.json`, no `.env` needed.  
**Typical prod setup:** `config.json` has non-secrets; token and service role key are set as platform environment variables.

### 4.4 Config Loader (complete implementation)

```ts
// src/config/load.ts
import { z } from 'zod'

const ConfigSchema = z.object({
    runtime: z
        .object({
            enableDiscordBot: z.boolean().default(true),
            enableDashboard: z.boolean().default(false),
            logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
        })
        .default({}),

    discord: z.object({
        token: z.string().min(1),
        applicationId: z.string().min(1),
        guildId: z.string().optional(),
    }),

    supabase: z.object({
        url: z.string().url(),
        anonKey: z.string().min(1),
        serviceRoleKey: z.string().optional(),
    }),
})

export type Config = z.infer<typeof ConfigSchema>

export async function loadConfig(path = 'config.json'): Promise<Config> {
    // 1. Read config.json (required to exist)
    const file = Bun.file(path)
    if (!(await file.exists())) throw new Error(`Config file not found: ${path}`)
    const json = await file.json()

    // 2. Overlay .env values (AUTOVC_SECTION_KEY wins if set)
    const e = process.env
    const set = (section: string, key: string, envKey: string) => {
        const v = e[`AUTOVC_${envKey}`]
        if (v !== undefined) {
            json[section] ??= {}
            json[section][key] = v
        }
    }
    set('discord', 'token', 'DISCORD_TOKEN')
    set('discord', 'applicationId', 'DISCORD_APPLICATIONID')
    set('discord', 'guildId', 'DISCORD_GUILDID')
    set('supabase', 'url', 'SUPABASE_URL')
    set('supabase', 'anonKey', 'SUPABASE_ANONKEY')
    set('supabase', 'serviceRoleKey', 'SUPABASE_SERVICEROLEKEY')
    set('runtime', 'logLevel', 'RUNTIME_LOGLEVEL')

    // 3. Validate merged result — exits with clear field errors on failure
    const result = ConfigSchema.safeParse(json)
    if (!result.success) {
        console.error('❌ Invalid config:', result.error.flatten().fieldErrors)
        process.exit(1)
    }
    return result.data
}
```

This is the **only file** that reads `config.json` or `process.env`. Every other module receives config as a plain typed object — no `process.env` calls scattered around the codebase.

---

## 5. Architecture

### 5.1 Layer Diagram

```
┌────────────────────────────────────────────────────────┐
│  src/index.ts  —  bootstrap + graceful shutdown        │
│  loadConfig() → start Discord client + optional API    │
└────────────────────────┬───────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
  ┌─────────────┐ ┌────────────┐ ┌──────────────────┐
  │  discord/   │ │  discord/  │ │  discord/        │
  │  client.ts  │ │  events/   │ │  commands/       │
  │  (intents)  │ │  (thin     │ │  (thin adapters) │
  └──────┬──────┘ │  adapters) │ └────────┬─────────┘
         │        └─────┬──────┘          │
         └──────────────┼─────────────────┘
                        ▼
         ┌──────────────────────────────────┐
         │  domain/                         │
         │  VoiceChannelService             │
         │  NamingEngine  SettingsMerger    │
         └──────────────┬───────────────────┘
                        ▼
         ┌──────────────────────────────────┐
         │  infra/                          │
         │  GuildConfigCache                │
         │  CreatorChannelIndex             │
         │  TempChannelRegistry             │
         │  Repositories (guild, creator,   │
         │    temp, counter)                │
         └──────────────┬───────────────────┘
                        ▼
                 ┌──────────────┐
                 │   Supabase   │
                 │  (Postgres)  │
                 └──────────────┘
```

### 5.2 Import Rules

| Layer      | May import from      |
| ---------- | -------------------- |
| `discord/` | `domain/`, `shared/` |
| `domain/`  | `infra/`, `shared/`  |
| `infra/`   | `shared/` only       |
| `shared/`  | nothing internal     |
| `config/`  | nothing internal     |

> `domain/` **never** imports from `discord/`. Business logic has zero knowledge of discord.js types.

---

## 6. Directory Layout

```
autovc/
├── config.json               ← primary config (gitignored)
├── config.example.json       ← committed template (no secrets)
├── .env                      ← optional overrides (gitignored)
├── .env.example              ← committed template (all keys commented out)
├── package.json
├── bunfig.toml
├── tsconfig.json
│
├── supabase/
│   └── migrations/
│       ├── 0001_schema.sql
│       └── 0002_rls.sql
│
└── src/
    ├── index.ts                         # bootstrap only — ~30 lines
    │
    ├── config/
    │   └── load.ts                      # ConfigSchema + loadConfig() — shown above
    │
    ├── shared/
    │   ├── errors.ts                    # AppError base class + typed errors
    │   └── types.ts                     # Snowflake type alias, minimal shared types
    │
    ├── discord/
    │   ├── client.ts                    # createClient(config) → Client
    │   ├── deploy-commands.ts           # reads commands/ dir, POSTs to Discord API
    │   │
    │   ├── events/                      # ← auto-loaded by _loader.ts
    │   │   ├── _loader.ts              # scans dir, wires client.on(event.name, ...)
    │   │   ├── ready.ts
    │   │   ├── voiceStateUpdate.ts
    │   │   ├── channelDelete.ts
    │   │   └── guildDelete.ts
    │   │
    │   └── commands/                    # ← auto-loaded by _loader.ts
    │       ├── _loader.ts              # scans dir, builds Map<name, command>
    │       ├── setup.ts
    │       ├── creator.ts
    │       └── settings.ts
    │
    ├── domain/
    │   ├── voice/
    │   │   ├── voice-channel.service.ts
    │   │   └── temp-channel.registry.ts
    │   │
    │   ├── settings/
    │   │   ├── guild-settings.ts        # GuildSettingsSchema + DEFAULT_SETTINGS
    │   │   └── settings-merger.ts       # merge(guild, creator) → EffectiveSettings
    │   │
    │   └── naming/
    │       ├── naming-engine.ts         # orchestrate: lex → parse → resolve → sanitize
    │       ├── lexer.ts
    │       ├── parser.ts
    │       └── placeholders/
    │           ├── _registry.ts         # ← auto-loads builtin/ dir on startup
    │           └── builtin/             # drop a .ts file here to add a placeholder
    │               ├── user.ts
    │               ├── guild.ts
    │               ├── channel.ts
    │               ├── game.ts
    │               ├── counter.ts
    │               ├── count.ts
    │               ├── timestamp.ts
    │               ├── random.ts
    │               └── emoji.ts
    │
    └── infra/
        ├── reconcile.ts                 # startup: DB ↔ cache sync
        ├── supabase/
        │   └── client.ts               # Supabase singleton (anon + optional service role)
        └── repositories/
            ├── guild.repo.ts
            ├── creator-channel.repo.ts
            ├── temp-channel.repo.ts
            └── counter.repo.ts
```

**Phase 1 file count target: ~35 source files.** Every file has one clear job.

---

## 7. Auto-Loading Registries

This is the central pattern that keeps boilerplate near zero across the entire codebase.

### 7.1 Event Loader

```ts
// src/discord/events/_loader.ts

export interface BotEvent {
    name: string // discord.js event name — e.g. "voiceStateUpdate"
    once?: boolean // use client.once() if true
    execute: (...args: unknown[]) => Promise<void>
}

export async function loadEvents(client: Client, dir: string): Promise<void> {
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
    for (const file of files) {
        const event = (await import(`${dir}/${file}`)).default as BotEvent
        client[event.once ? 'once' : 'on'](event.name, (...args) => event.execute(...args))
    }
}
```

Each event file exports a single `BotEvent` default. No registration arrays. No index files.

```ts
// src/discord/events/voiceStateUpdate.ts  — full file
import type { BotEvent } from './_loader'
import { voiceService } from '../../domain/voice/voice-channel.service'

export default {
    name: 'voiceStateUpdate',
    async execute(oldState: VoiceState, newState: VoiceState) {
        await voiceService.handleStateChange(oldState, newState)
    },
} satisfies BotEvent
```

### 7.2 Command Loader

```ts
// src/discord/commands/_loader.ts

export interface BotCommand {
    data: SlashCommandBuilder
    execute: (i: ChatInputCommandInteraction) => Promise<void>
}

export async function loadCommands(dir: string): Promise<Map<string, BotCommand>> {
    const map = new Map<string, BotCommand>()
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
    for (const file of files) {
        const cmd = (await import(`${dir}/${file}`)).default as BotCommand
        map.set(cmd.data.name, cmd)
    }
    return map
}
```

### 7.3 Placeholder Registry

```ts
// src/domain/naming/placeholders/_registry.ts

export interface PlaceholderModule {
    tokens: string[] // all token names this module handles
    resolve: (ctx: NamingContext, arg?: string) => string | Promise<string>
}

export async function buildRegistry(dir: string): Promise<PlaceholderRegistry> {
    const registry = new PlaceholderRegistry()
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_'))
    for (const file of files) {
        const mod = (await import(`${dir}/${file}`)).default as PlaceholderModule
        for (const token of mod.tokens) registry.register(token, mod.resolve)
    }
    return registry
}
```

Adding a placeholder is one new file. Zero changes to any existing file:

```ts
// src/domain/naming/placeholders/builtin/timestamp.ts  — full file
import type { PlaceholderModule } from '../_registry'

export default {
    tokens: ['timestamp', 'timestamp:unix', 'timestamp:iso'],
    resolve(_ctx, arg) {
        const now = new Date()
        if (arg === 'unix') return String(Math.floor(now.getTime() / 1000))
        if (arg === 'iso') return now.toISOString()
        return now.toTimeString().slice(0, 5) // HH:MM
    },
} satisfies PlaceholderModule
```

### 7.4 Bootstrap (`src/index.ts`)

The entry point is tiny — it only wires the loaders together:

```ts
// src/index.ts
import { loadConfig } from './config/load'
import { createClient } from './discord/client'
import { loadEvents } from './discord/events/_loader'
import { loadCommands } from './discord/commands/_loader'
import { buildRegistry } from './domain/naming/placeholders/_registry'
import { reconcile } from './infra/reconcile'

const config = await loadConfig()
const client = createClient(config.discord)
const commands = await loadCommands('src/discord/commands')
const registry = await buildRegistry('src/domain/naming/placeholders/builtin')

await loadEvents(client, 'src/discord/events')

client.once('ready', async () => {
    await reconcile() // sync DB temp_channels ↔ in-memory registry
})

await client.login(config.discord.token)

const shutdown = async (sig: string) => {
    console.log(`${sig} received — shutting down`)
    await client.destroy()
    process.exit(0)
}
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
```

---

## 8. Database Schema

### `0001_schema.sql`

```sql
-- guilds: one row per Discord server
create table guilds (
  id          text        primary key,
  enabled     boolean     not null default true,
  settings    jsonb       not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- creator_channels: one or more per guild
create table creator_channels (
  id          uuid        primary key default gen_random_uuid(),
  guild_id    text        not null references guilds(id) on delete cascade,
  channel_id  text        not null unique,
  label       text,
  settings    jsonb       not null default '{}',
  created_at  timestamptz not null default now(),
  unique (guild_id, channel_id)
);
create index creator_channels_guild_idx on creator_channels (guild_id);

-- temp_channels: runtime tracking (survives restarts)
create table temp_channels (
  channel_id          text        primary key,
  guild_id            text        not null,
  creator_channel_id  text        not null,
  owner_id            text        not null,
  created_at          timestamptz not null default now()
);
create index temp_channels_guild_idx on temp_channels (guild_id);

-- guild_counters: named atomic counters for {counter:key}
create table guild_counters (
  guild_id     text   not null references guilds(id) on delete cascade,
  counter_key  text   not null,
  value        bigint not null default 0,
  primary key (guild_id, counter_key)
);

-- Atomic increment RPC — prevents race conditions under burst joins
create or replace function increment_guild_counter(
  p_guild_id    text,
  p_counter_key text,
  p_by          bigint default 1
) returns bigint language plpgsql as $$
declare new_val bigint;
begin
  insert into guild_counters (guild_id, counter_key, value)
    values (p_guild_id, p_counter_key, p_by)
    on conflict (guild_id, counter_key)
    do update set value = guild_counters.value + excluded.value
    returning value into new_val;
  return new_val;
end; $$;
```

### `0002_rls.sql`

```sql
-- Enable RLS on all tables
-- Bot bypasses via service role key; anon key respects policies
alter table guilds            enable row level security;
alter table creator_channels  enable row level security;
alter table temp_channels     enable row level security;
alter table guild_counters    enable row level security;

-- Phase 3 dashboard policies go here
-- create policy "guild admin select" on guilds for select using (...);
```

---

## 9. Guild Settings System

### 9.1 Zod Schema — single source of truth

```ts
// src/domain/settings/guild-settings.ts
import { z } from 'zod'

export const GuildSettingsSchema = z
    .object({
        channelNameTemplate: z.string().default("{user.displayName}'s Channel"),
        gameFallback: z.string().default('Voice Channel'),
        emojiPool: z.array(z.string()).default([]),
        categoryId: z.string().nullable().default(null),
        bitrate: z.number().int().min(8).max(384).nullable().default(null),
        userLimit: z.number().int().min(0).max(99).nullable().default(null),
        rtcRegion: z.string().nullable().default(null),
        deleteDelayMs: z.number().int().min(0).max(30_000).default(3_000),
        syncCategoryPermissions: z.boolean().default(true),
        defaultOwnerPermissions: z
            .array(
                z.object({
                    id: z.string(),
                    type: z.union([z.literal(0), z.literal(1)]),
                    allow: z.string().optional(),
                    deny: z.string().optional(),
                }),
            )
            .default([]),
        maxChannelsPerUser: z.number().int().min(1).max(10).nullable().default(null),
    })
    .default({})

export type GuildSettings = z.infer<typeof GuildSettingsSchema>
export const DEFAULT_SETTINGS = GuildSettingsSchema.parse({})
```

### 9.2 Merge — one line

```ts
// src/domain/settings/settings-merger.ts
import { GuildSettingsSchema, GuildSettings } from './guild-settings'

export function mergeSettings(guild: Partial<GuildSettings>, creator: Partial<GuildSettings> = {}): GuildSettings {
    // defaults → guild → creator; Zod fills any missing keys with defaults
    return GuildSettingsSchema.parse({ ...guild, ...creator })
}
```

### 9.3 Merge Priority

```
DEFAULT_SETTINGS (Zod defaults)
     ↓  overridden by
guilds.settings JSONB
     ↓  overridden by
creator_channels.settings JSONB
     ↓
EffectiveSettings  ← what VoiceChannelService actually receives
```

---

## 10. Naming Engine

### 10.1 Pipeline

```
Template:  "{user.displayName}'s {game} channel #{counter:global}"
               │
           [ Lexer ]  — scan for {…}, support \{ escaping
               │
           Token[] = [LIT, PH("user.displayName"), LIT,
                      PH("game"), LIT, PH("counter","global")]
               │
           [ Parser ]  — split name:arg
               │
           AST[]  = [{ lit }, { ph, name, arg? }, ...]
               │
           [ Resolver ]  — parallel Promise.all (serial only for {counter})
               │
           ["Asher", "'s ", "Minecraft", " channel #", "42"]
               │
           [ Sanitizer ]  — strip invalid chars, slice(0,100), fallback if empty
               │
           "Asher's Minecraft channel #42"
```

### 10.2 Built-in Placeholders

| Token                           | Output                                 |
| ------------------------------- | -------------------------------------- |
| `{user}` · `{user.displayName}` | Guild nickname or username             |
| `{user.name}`                   | Username                               |
| `{user.tag}`                    | `username#0000`                        |
| `{user.id}`                     | Snowflake                              |
| `{guild}` · `{guild.name}`      | Guild name                             |
| `{guild.id}`                    | Guild snowflake                        |
| `{members}`                     | `guild.memberCount`                    |
| `{count}`                       | Members in new channel (usually 1)     |
| `{channel}`                     | Creator channel name                   |
| `{game}`                        | First activity name or `gameFallback`  |
| `{counter:key}`                 | Atomic DB increment, named per-guild   |
| `{timestamp}`                   | `HH:MM`                                |
| `{timestamp:unix}`              | Unix epoch seconds                     |
| `{timestamp:iso}`               | ISO 8601                               |
| `{random:min-max}`              | Integer in range                       |
| `{emoji}`                       | Random from `emojiPool`, fallback `🎙️` |

**Error contract:** resolver throws → `""` substituted → sanitizer runs → fallback to `gameFallback` if blank. Channel creation **never fails** because of a naming error.

### 10.3 v2 Filter Hook (stubbed, not wired)

```ts
// Ready for "{user.displayName|upper|trim:10}" syntax in Phase 2
export interface ResolverFilter {
    name: string
    apply: (value: string, arg?: string) => string
}
```

---

## 11. Caching Strategy

All caches are plain `Map` instances — no library needed.

| Cache                 | Key                         | Invalidation trigger                     |
| --------------------- | --------------------------- | ---------------------------------------- | ----------------------- |
| `GuildConfigCache`    | `guildId → GuildSettings`   | `/settings set`, `/setup`, `guildDelete` |
| `CreatorChannelIndex` | `channelId → CreatorConfig` | `/creator add                            | remove`, `ready` reload |
| `TempChannelRegistry` | `channelId → TempMeta`      | Channel create / delete events           |

### Startup Reconciliation

```
ready event fires:
  1. Fetch all creator_channels → rebuild CreatorChannelIndex
  2. Fetch all temp_channels rows
  3. For each row:
       guild.channels.cache.has(channelId)?
         yes → TempChannelRegistry.register(row)
         no  → db.tempChannels.delete(row.channelId)   // stale from crash
  4. Deploy slash commands (guild-scoped if config.discord.guildId is set)
```

---

## 12. Voice Lifecycle

### 12.1 Join → create temp channel

```
voiceStateUpdate (user joins a channel)
   │
   ├─ CreatorChannelIndex.get(channelId) → null? ignore
   │
   └─ VoiceChannelService.handleJoin(member, creatorConfig)
         ├─ [per-guild mutex acquired]
         ├─ GuildConfigCache.get(guildId) → mergeSettings(guild, creator)
         ├─ NamingEngine.render(template, context)
         ├─ guild.channels.create({ type: GuildVoice, name, bitrate, ... })
         ├─ member.voice.setChannel(tempChannel)
         ├─ db.tempChannels.insert(row)
         ├─ TempChannelRegistry.register(tempChannel.id)
         └─ [mutex released]
```

### 12.2 Leave → schedule delete

```
voiceStateUpdate (user leaves a channel)
   │
   ├─ TempChannelRegistry.has(channelId) → false? ignore
   │
   └─ VoiceChannelService.handleLeave(channelId)
         ├─ channel.members.size > 0? cancelDelete(channelId); return
         └─ scheduleDelete(channelId, deleteDelayMs, async () => {
               channel.delete()
               db.tempChannels.delete(channelId)
               TempChannelRegistry.unregister(channelId)
            })
```

### 12.3 Grace Period — rejoin cancels delete timer

```
voiceStateUpdate (user joins existing temp channel)
   └─ TempChannelRegistry.cancelDelete(channelId)   ← setTimeout cleared
```

### 12.4 Concurrent Joins — burst safety

```ts
private mutexes = new Map<string, Mutex>();

async handleJoin(member: GuildMember, creator: VoiceChannel) {
  const mutex = this.mutexes.get(member.guild.id) ?? new Mutex();
  this.mutexes.set(member.guild.id, mutex);
  await mutex.runExclusive(() => this.#createChannel(member, creator));
}
```

---

## 13. Slash Commands

All commands require `ManageChannels`. `/setup` additionally requires `Administrator`. All replies are `ephemeral: true`.

| Command           | Options             | Action                                   |
| ----------------- | ------------------- | ---------------------------------------- |
| `/setup`          | —                   | Upsert guild row, apply default settings |
| `/creator add`    | `channel`, `label?` | Register channel as creator              |
| `/creator remove` | `channel`           | Unregister creator                       |
| `/creator list`   | —                   | List all creators with labels            |
| `/settings view`  | `creator?`          | Show merged effective settings           |
| `/settings set`   | `key`, `value`      | Patch one dotted key (Zod-validated)     |
| `/settings reset` | `key?`              | Reset key or all to defaults             |

**Write-through pattern:** every DB write immediately calls `cache.invalidate(guildId)` — no async cache drift in single-instance mode.

---

## 14. Security & Operations

### 14.1 Secret Handling

| Secret            | Where it lives                                    | Never in                                     |
| ----------------- | ------------------------------------------------- | -------------------------------------------- |
| Discord token     | `config.json` or `AUTOVC_DISCORD_TOKEN`           | Logs, error messages, DB                     |
| Supabase anon key | `config.json`                                     | Safe to expose to browser clients in Phase 3 |
| Service role key  | `config.json` or `AUTOVC_SUPABASE_SERVICEROLEKEY` | Browser, dashboard, logs                     |

The service role key is used **only** inside `src/infra/supabase/client.ts`. If absent, the bot falls back to the anon key — admin operations requiring elevated access fail with a clear logged error, not silently.

### 14.2 `config.example.json`

```jsonc
{
    "runtime": {
        "enableDiscordBot": true,
        "enableDashboard": false,
        "logLevel": "info",
    },
    "discord": {
        "token": "YOUR_BOT_TOKEN",
        "applicationId": "YOUR_APPLICATION_ID",
        "guildId": "",
    },
    "supabase": {
        "url": "https://YOUR_PROJECT.supabase.co",
        "anonKey": "YOUR_ANON_KEY",
        "serviceRoleKey": "",
    },
}
```

### 14.3 `.env.example`

```ini
# All optional — values here override config.json equivalents.
# Useful in CI/production where you don't want secrets in a file.
# AUTOVC_DISCORD_TOKEN=
# AUTOVC_DISCORD_APPLICATIONID=
# AUTOVC_DISCORD_GUILDID=
# AUTOVC_SUPABASE_URL=
# AUTOVC_SUPABASE_ANONKEY=
# AUTOVC_SUPABASE_SERVICEROLEKEY=
# AUTOVC_RUNTIME_LOGLEVEL=
```

---

## 15. Implementation Phases

### Phase 1 — Bot Core _(current milestone)_

| #   | Deliverable                                         | New files                                                   |
| --- | --------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Config loader + example files                       | `src/config/load.ts`, `config.example.json`, `.env.example` |
| 2   | Supabase migrations + counter RPC                   | `supabase/migrations/0001_schema.sql`, `0002_rls.sql`       |
| 3   | Supabase client singleton                           | `src/infra/supabase/client.ts`                              |
| 4   | Repository layer                                    | `src/infra/repositories/*.repo.ts` (4 files)                |
| 5   | Zod settings schema + SettingsMerger                | `src/domain/settings/*.ts` (2 files)                        |
| 6   | Cache layer (3 Maps)                                | `src/infra/cache/*.ts` (3 files)                            |
| 7   | Naming engine: lexer + parser + registry + builtins | `src/domain/naming/**` (~12 files)                          |
| 8   | VoiceChannelService + per-guild mutex               | `src/domain/voice/voice-channel.service.ts`                 |
| 9   | TempChannelRegistry                                 | `src/domain/voice/temp-channel.registry.ts`                 |
| 10  | Event loader + 4 event files                        | `src/discord/events/**` (5 files)                           |
| 11  | Command loader + 3 command files                    | `src/discord/commands/**` (4 files)                         |
| 12  | Startup reconciler                                  | `src/infra/reconcile.ts`                                    |
| 13  | Bootstrap entry point                               | `src/index.ts`                                              |
| 14  | README + test checklist                             | `README.md`                                                 |

**Total new files: ~38**

### Phase 2 — Enhanced Features

- Pipe filters in naming: `{user.displayName|upper}`, `{game|trim:15}`
- Conditional expressions: `{game ?? "Just Chatting"}`
- `/vc` owner commands: `transfer`, `lock`, `unlock`, `limit`, `name`
- Join-to-create component buttons
- Supabase Realtime → cache invalidation for multi-instance horizontal scaling

### Phase 3 — Dashboard

- `src/api/` — Hono HTTP server, gated by `runtime.enableDashboard` in `config.json`
- Supabase Auth + Discord OAuth for guild admin verification
- Reuses same `domain/` services and `infra/repositories` — zero code duplication
- `config.json` drives whether the API server starts at all (zero overhead when disabled)

---

## 16. Manual Test Plan

```
Setup
  [ ] cp config.example.json config.json  — fill in token, applicationId, Supabase creds
  [ ] supabase db push
  [ ] bun run dev  →  logs "Ready | X guilds"

Guild Bootstrap
  [ ] /setup in test guild → ephemeral success reply
  [ ] Confirm guilds row exists in Supabase dashboard

Creator Registration
  [ ] Create a voice channel "➕ Join to Create"
  [ ] /creator add channel:<channel> label:default
  [ ] Confirm creator_channels row exists in DB

Core Voice Flow
  [ ] Join the creator channel
  [ ] Temp VC created + you are moved in within ~1 second
  [ ] Confirm temp_channels row in DB

Auto-Delete
  [ ] Leave temp channel
  [ ] After deleteDelayMs → channel gone from Discord + DB row deleted

Grace Period
  [ ] Leave then immediately rejoin within deleteDelayMs
  [ ] Channel NOT deleted

Custom Naming
  [ ] /settings set key:channelNameTemplate value:"{user.displayName} | {game}"
  [ ] Join with an active game → channel name reflects template
  [ ] Join without a game → falls back to gameFallback value

Concurrent Joins
  [ ] Two accounts join creator simultaneously
  [ ] Two unique channels created
  [ ] If {counter:global} used: counters are 1 and 2, no duplicates

Restart Reconciliation
  [ ] While temp channels exist, kill bot (Ctrl+C) and restart
  [ ] Active temp channels re-registered in cache
  [ ] Stale DB rows for deleted channels cleaned up on ready

Edge Cases
  [ ] Admin manually deletes a temp channel → channelDelete fires, DB row cleaned, no crash
  [ ] Remove bot from guild → guildDelete fires, cache purged, no crash

.env Override
  [ ] Remove discord.token from config.json
  [ ] Add AUTOVC_DISCORD_TOKEN=<token> to .env
  [ ] Bot starts correctly using env value
```

---

## 17. Task Tracker

| ID                | Task                                                                | Status         |
| ----------------- | ------------------------------------------------------------------- | -------------- |
| `config`          | Config loader — `config.json` + `.env` merge + Zod validation       | 🔄 In Progress |
| `supabase-schema` | Migrations: 4 tables + RLS + counter RPC                            | ⏳ Pending     |
| `infra-client`    | Supabase singleton (anon + optional service role)                   | ⏳ Pending     |
| `repositories`    | guild, creator-channel, temp-channel, counter repos                 | ⏳ Pending     |
| `domain-settings` | GuildSettingsSchema + SettingsMerger                                | ⏳ Pending     |
| `cache-layer`     | GuildConfigCache + CreatorChannelIndex + TempChannelRegistry        | ⏳ Pending     |
| `naming-engine`   | Lexer + parser + auto-loading registry + all 9 builtin placeholders | ⏳ Pending     |
| `voice-service`   | VoiceChannelService + per-guild mutex + grace period cancel         | ⏳ Pending     |
| `event-loader`    | Auto-loading EventLoader + 4 event handler files                    | ⏳ Pending     |
| `command-loader`  | Auto-loading CommandLoader + /setup, /creator, /settings            | ⏳ Pending     |
| `reconcile`       | Startup DB ↔ cache reconciliation                                   | ⏳ Pending     |
| `bootstrap`       | src/index.ts wiring all loaders                                     | ⏳ Pending     |
| `docs`            | README + config.example.json + .env.example + test checklist        | ⏳ Pending     |

---

_Phase 1 target · Last updated May 2026_
