/** Administrator-only progress of incomplete themed challenges, grouped by topic. */
import { SUPABASE_PUBLIC_CONFIG } from './supabase-config.js';
import { resolveSupabasePublicConfig } from './content-source.js';
export async function fetchAdminChallengeStatus({session,config=SUPABASE_PUBLIC_CONFIG,fetchImpl=globalThis.fetch}={}) {
  const settings=resolveSupabasePublicConfig(config);
  if (!settings.configured || !session?.access_token) throw new Error('Brak sesji administratora.');
  const response=await fetchImpl(new URL(`${settings.projectUrl}/rest/v1/rpc/campaign_admin_challenge_status`), {
    method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json',
      apikey:settings.publishableKey,Authorization:`Bearer ${session.access_token}`},body:'{}'
  });
  if (!response?.ok) throw new Error(`Status Challenge: HTTP ${response?.status || '?'}`);
  const rows=await response.json();
  if (!Array.isArray(rows)) throw new Error('Nieprawidłowy status Challenge.');
  return rows;
}
