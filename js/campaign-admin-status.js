import { SUPABASE_PUBLIC_CONFIG } from './supabase-config.js';
import { resolveSupabasePublicConfig } from './content-source.js';
export async function fetchAdminQueueStatus({session,config=SUPABASE_PUBLIC_CONFIG,fetchImpl=globalThis.fetch}={}) {
  const settings=resolveSupabasePublicConfig(config);
  if (!settings.configured || !session?.access_token) throw new Error('Brak sesji administratora lub konfiguracji Supabase.');
  const response=await fetchImpl(new URL(`${settings.projectUrl}/rest/v1/rpc/campaign_admin_queue_status`), {
    method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json',
      apikey:settings.publishableKey,Authorization:`Bearer ${session.access_token}`},body:'{}'
  });
  if (!response?.ok) throw new Error(`Status kampanii HTTP ${response?.status || '?'}`);
  const data=await response.json();
  if (!Number.isInteger(data?.queued) || ![5,10].includes(data?.target)) throw new Error('Nieprawidłowy status kolejki.');
  return data;
}
