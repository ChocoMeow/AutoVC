-- guild_configs: one row per Discord server (config root + extensible settings JSONB)
create table guild_configs (
  id          text        primary key,
  enabled     boolean     not null default true,
  settings    jsonb       not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table guild_configs is 'Per-Discord-guild AutoVC configuration';
comment on column guild_configs.settings is 'Extensible JSON settings; known keys validated in app, unknown keys preserved for future features';

-- creator_channels: one or more per guild
create table creator_channels (
  id          uuid        primary key default gen_random_uuid(),
  guild_id    text        not null references guild_configs(id) on delete cascade,
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
  settings            jsonb       not null default '{}',
  created_at          timestamptz not null default now()
);
create index temp_channels_guild_idx on temp_channels (guild_id);
