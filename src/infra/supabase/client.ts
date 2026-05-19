import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Config } from '@/config/load.ts';
import type { Logger } from '@/shared/logger.ts';

let adminClient: SupabaseClient | null = null;

function decodeJwtRole(key: string): string | null {
  try {
    const payload = key.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      role?: string;
    };
    return json.role ?? null;
  } catch {
    return null;
  }
}

export function getSupabase(config: Config, logger?: Logger): SupabaseClient {
  if (adminClient) return adminClient;

  const key = config.supabase.serviceRoleKey ?? config.supabase.anonKey;
  const role = decodeJwtRole(key);
  const log: Pick<Logger, 'warn' | 'debug'> = logger ?? {
    warn: (msg: string) => console.warn(msg),
    debug: () => undefined,
  };

  if (!config.supabase.serviceRoleKey) {
    log.warn(
      'supabase.serviceRoleKey is not set — using anon key. Bot DB writes will fail under RLS.',
    );
  } else if (role && role !== 'service_role') {
    log.warn(
      { role },
      'Expected service_role JWT; use legacy service_role from Project Settings → API',
    );
  } else {
    log.debug('Supabase client using service_role key');
  }

  adminClient = createClient(config.supabase.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}
