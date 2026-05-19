# AutoVC

AutoVC is a Discord bot that creates **temporary voice channels** when members join a **join-to-create** hub. Each user gets their own voice channel, optional in-channel controls, and the channel is removed after everyone leaves.

Built with [Bun](https://bun.sh), [discord.js](https://discord.js.org/) v14, and [Supabase](https://supabase.com).

---

## Table of contents

1. [How it works](#how-it-works)
2. [Requirements](#requirements)
3. [Create a Discord application](#create-a-discord-application)
4. [Install Bun](#install-bun)
5. [Project setup](#project-setup)
6. [Supabase setup](#supabase-setup)
7. [Configure the bot](#configure-the-bot)
8. [Deploy slash commands](#deploy-slash-commands)
9. [Run the bot](#run-the-bot)
10. [Using the bot in your server](#using-the-bot-in-your-server)
11. [Templates and placeholders](#templates-and-placeholders)
12. [Configuration reference](#configuration-reference)
13. [Troubleshooting](#troubleshooting)
14. [Scripts](#scripts)

---

## How it works

```text
Member joins "Join to Create" hub  →  Bot creates temp voice channel  →  Member is moved in
Member leaves (channel empty)      →  After a short delay, channel is deleted
```

- **Creator (hub) channel** — The voice channel users join to spawn a temp channel.
- **Temp channel** — Owned by the member who joined; configurable name, limits, greeting, and control panel.
- **Settings** — Stored per guild (and optionally per hub) in Supabase; edited through the `/creator` panel (no separate `/settings` commands).

---

## Requirements

| Tool | Version |
|------|---------|
| [Bun](https://bun.sh) | 1.3.10 |
| [Supabase](https://supabase.com) account | Free tier is fine |
| Discord server | You need **Manage Server** to configure the bot |

---

## Create a Discord application

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Go to **Bot** → **Reset Token** → copy the token (this is `discord.token`).
3. Enable **Privileged Gateway Intents** if shown:
   - **Server Members Intent** (recommended for role-based placeholders)
   - **Presence Intent** (required for `{game}` in channel names)
4. Go to **OAuth2** → **General** → copy **Application ID** (`discord.applicationId`).
5. Under **OAuth2** → **URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions (minimum):
     - View Channels
     - Manage Channels
     - Move Members
     - Connect
     - Send Messages (for voice-chat greeting / panel)
   - Copy the generated invite URL and add the bot to your server.

> The **bot role** must have these permissions in the category where channels are created—not only your user account.

---

## Install Bun

Install [Bun](https://bun.sh) **1.3.10** from the official site, then verify with `bun --version`.

---

## Project setup

```bash
git clone https://github.com/ChocoMeow/AutoVC.git
cd AutoVC
bun install
```

Copy the example config:

```bash
cp config.example.json config.json
```

Optional: copy secrets to `.env` so they are not committed:

```bash
cp .env.example .env
```

Supported environment overrides (replace values in `config.json`):

| Variable | Maps to |
|----------|---------|
| `AUTOVC_DISCORD_TOKEN` | `discord.token` |
| `AUTOVC_DISCORD_APPLICATIONID` | `discord.applicationId` |
| `AUTOVC_DISCORD_GUILDID` | `discord.guildId` (optional, dev only) |
| `AUTOVC_SUPABASE_URL` | `supabase.url` |
| `AUTOVC_SUPABASE_ANONKEY` | `supabase.anonKey` |
| `AUTOVC_SUPABASE_SERVICEROLEKEY` | `supabase.serviceRoleKey` |

---

## Supabase setup

### 1. Create a project

1. [supabase.com](https://supabase.com) → **New project**.
2. Wait for the database to finish provisioning.

### 2. Get API keys

**Project Settings** → **API**:

| Key | Use in `config.json` |
|-----|----------------------|
| Project URL | `supabase.url` |
| `anon` `public` | `supabase.anonKey` |
| `service_role` `secret` | `supabase.serviceRoleKey` |

Use the **service role** key for the bot. Row Level Security is enabled; the bot must bypass RLS for server-side writes.

### 3. Apply database migrations

**Option A — Supabase CLI (recommended)**

```bash
bun run db:link    # one-time: log in and link this repo to your project
bun run db:push    # applies supabase/migrations/
```

**Option B — SQL Editor**

Run these files in order in the Supabase **SQL Editor**:

1. `supabase/migrations/0001_schema.sql` — tables (`guild_configs`, `creator_channels`, `temp_channels`)
2. `supabase/migrations/0002_rls.sql` — RLS + `service_role` grants

### 4. Verify tables

In **Table Editor** you should see:

- `guild_configs` — one row per Discord server
- `creator_channels` — join-to-create hubs
- `temp_channels` — active temp channels (survives bot restarts)

---

## Configure the bot

Edit `config.json` (minimum):

```json
{
  "discord": {
    "token": "YOUR_BOT_TOKEN",
    "applicationId": "YOUR_APPLICATION_ID",
    "guildId": "",
    "deployCommands": "never"
  },
  "supabase": {
    "url": "https://YOUR_PROJECT.supabase.co",
    "anonKey": "YOUR_ANON_KEY",
    "serviceRoleKey": "YOUR_SERVICE_ROLE_KEY"
  }
}
```

| Field | Notes |
|-------|--------|
| `discord.guildId` | Optional. Set to your server ID to register slash commands instantly in one guild (good for testing). Leave empty for global commands (can take up to an hour). |
| `discord.deployCommands` | `never` (default) — run `bun run deploy:commands` manually. `when-changed` — auto-deploy on startup if command JSON changed. |
| `defaults.guild` | Default templates, delete delay, mod log templates, greeting, etc. See `config.example.json`. |
| `recovery` | Cleans stale channels and catches missed joins after restarts. |
| `channelNameRefresh` | Periodically re-applies dynamic name templates (`{game}`, `{counter}`, …). |

---

## Deploy slash commands

Commands are **not** registered on every startup by default.

```bash
bun run deploy:commands
```

You should see a success message in the terminal. In Discord, type `/` and confirm **`/creator`** appears (may take a minute for global deploy).

---

## Run the bot

**Development (auto-restart on file changes):**

```bash
bun run dev
```

**Production:**

```bash
bun run start
```

On success, the console shows something like `Bot ready` with a guild count. Logs are written to `logs/autovc.log` (see `logging` in config).

Stop with `Ctrl+C`.

---

## Using the bot in your server

### Step 1 — Open the control panel

Anyone with **Manage Server** (or Administrator) can run:

```text
/creator
```

This opens the **AutoVC control panel** (buttons and menus—not extra slash subcommands).

### Step 2 — Create a join-to-create hub

1. Click **➕ Create**.
2. The bot creates a voice channel (default name from `defaults.creator.channelName`, e.g. `➕ Join to Create`).
3. A row is saved in Supabase (`guild_configs` + `creator_channels`).

### Step 3 — Test the flow

1. Join the new hub voice channel as a normal member.
2. AutoVC creates a temp channel, moves you in, and registers it in `temp_channels`.
3. Leave the temp channel. When it is empty, it is deleted after `deleteDelayMs` (default 3 seconds).

### Step 4 — Configure the server

In `/creator` → **⚙️ Settings**:

| Section | What you can change |
|---------|---------------------|
| **Permissions** | How temp channels inherit overwrites; extra owner permissions |
| **Voice** | Bitrate, user limit, RTC region for new temps |
| **Behavior** | Temp category, delete delay, max channels per user, **channel name template** |
| **Voice chat** | Greeting message, control panel on/off (guild-wide) |
| **Mod logs** | Log text channel and message templates |
| **Language** | Panel language (`en` / `zh-TW`) |

Open **per-creator** settings by choosing a hub in the creator selector on the settings home page. Creator settings override guild defaults for temps from that hub only.

### Step 5 — Remove a hub

`/creator` → **🗑️ Remove** → select the hub → confirm. The voice channel is deleted and the database row is removed.

### Temp channel control panel (owners)

If **Control panel** is enabled under **Voice chat** settings, each new temp channel posts an interactive panel in **voice chat**. The **owner** must be **connected to that voice channel** to use it:

- Rename (supports templates)
- Set user limit / region
- Kick, block, or transfer ownership
- Delete the temp channel

---

## Templates and placeholders

AutoVC uses one **template engine** for channel names, greetings, rename modals, and mod logs. Syntax: `{placeholder}` or `{placeholder:arg}`.

### Channel names, greetings, rename

| Placeholder | Description |
|-------------|-------------|
| `{creator}`, `{creator.displayName}`, `{creator.name}`, `{creator.id}`, `{creator.tag}` | Temp channel **owner** |
| `{creator.highestRole}`, `{creator.hoistRole}` | Owner’s roles |
| `{channel}`, `{channel.name}`, `{channel.id}`, `{channel.members}` | Temp voice channel |
| `{creatorchannel.name}`, `{creatorchannel.id}`, `{creatorchannel.mention}` | Join-to-create **hub** |
| `{guild.name}`, `{guild.id}`, `{guild.members}` | Server |
| `{game}` | Games played by members in the channel (needs Presence intent) |
| `{count}` | Member count in the temp channel |
| `{counter}` | Active temps for this hub (+1 for the new channel) |
| `{counter:owner}` | Active temps owned by this user |
| `{timestamp}`, `{timestamp:unix}`, `{timestamp:iso}` | Time |
| `{random}`, `{random:1-100}`, `{random:emoji}` | Random values |
| `{emoji}` | Random emoji from `defaults.guild.emojiPool` |

**Examples**

- Name template: `{creator.displayName}'s Channel`
- Dynamic: `{creator.displayName} | {game}`
- Greeting: `Welcome {creator.displayName}! Use the panel below to manage your channel.`

Edit the name template: **Settings** → **Behavior** → **✏️ Edit name template**.

### Mod log templates

Configure under **Settings** → **Mod logs**. Extra placeholders:

| Placeholder | Description |
|-------------|-------------|
| `{newchannel.*}` | Channel after the event (create, join, rename “new” side) |
| `{oldchannel.*}` | Channel before the event (delete, leave, rename “old” side) |
| `{creatorchannel.*}` | Join-to-create hub |
| `{creator.*}` | Acting user / temp owner |

Logs are plain text (mentions do not ping). AutoVC posts via a webhook in the channel you select.

---

## Configuration reference

### Slash command deploy modes

| `discord.deployCommands` | Behavior |
|--------------------------|----------|
| `never` | Only `bun run deploy:commands` |
| `when-changed` | Deploy on startup if command definitions changed |
| `always` | Deploy every startup (not recommended) |

### Voice recovery

When the bot starts (and on a timer), it:

- Deletes **empty** temp channels left behind
- Removes **stale** DB rows for deleted channels
- Creates temps for users still sitting in a hub (missed joins while the bot was offline)

Tune in `recovery` in `config.json`.

### Logs

| Setting | Default |
|---------|---------|
| `logging.directory` | `logs` |
| `logging.fileName` | `autovc.log` |
| `logging.maxHistory` | `7` rotated files |

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| `/creator` does not appear | Run `bun run deploy:commands`. For global commands, wait up to ~1 hour or set `discord.guildId` for instant guild deploy. |
| Bot starts but nothing happens on join | Bot needs **Manage Channels** + **Move Members** in the hub’s category. Check startup warnings in the console. |
| Database errors on create | Set `supabase.serviceRoleKey` (not only anon). Run migrations `0001` and `0002`. |
| `{game}` always shows fallback | Enable **Presence Intent** in the Developer Portal. |
| Temp channel not deleted | Someone may still be in the channel, or delete was scheduled—check `deleteDelayMs`. |
| Panel buttons do nothing | Owner must be **in that voice channel**. Only the temp owner can use controls. |
| `supabase` CLI not found | Run `bun install` in the project, then use `bun run db:link` (not bare `supabase` unless installed globally). |

---

## Scripts

| Command | Description |
|---------|-------------|
| `bun install` | Install dependencies |
| `bun run dev` | Start bot with file watch |
| `bun run start` | Start bot |
| `bun run deploy:commands` | Register `/creator` with Discord |
| `bun run db:link` | Link Supabase CLI to your project |
| `bun run db:push` | Push migrations to Supabase |
| `bun run typecheck` | Run TypeScript without emitting files |

---

## Docker

Build and run with the official [Bun 1.3.10 image](https://hub.docker.com/r/oven/bun/tags) (`oven/bun:1.3.10-alpine`):

```bash
docker build -t autovc .
docker run --rm -it \
  -v "$(pwd)/config.json:/app/config.json:ro" \
  -v autovc-logs:/app/logs \
  autovc
```

You can pass secrets via environment variables instead of mounting `config.json` (see [.env.example](.env.example)).

---

## Project layout

```text
src/
  index.ts              # Entry point
  config/               # config.json loader
  discord/              # Client, events, /creator panel UI
  domain/               # Voice logic, settings, templates, mod logs
  infra/                # Supabase repos, caches, schedulers
  i18n/                 # en + zh-TW strings
supabase/migrations/    # Database schema
config.example.json     # Documented defaults
```

---

## License

[MIT](LICENSE)
