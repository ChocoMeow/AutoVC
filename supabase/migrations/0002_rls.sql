alter table guild_configs enable row level security;
alter table creator_channels enable row level security;
alter table temp_channels enable row level security;

grant usage on schema public to service_role;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  grant all on tables to service_role;

alter default privileges in schema public
  grant all on sequences to service_role;

alter default privileges in schema public
  grant execute on functions to service_role;

-- Phase 3 dashboard policies go here
