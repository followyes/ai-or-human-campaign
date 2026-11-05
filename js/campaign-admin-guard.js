/**
 * Destructive admin operations must not damage active campaign stages.
 * This is an extra client-side safety check; database and Storage RLS policies
 * in SUPABASE_SQL/03_panel_admina_setup.sql enforce protection server-side.
 */
import { resolveSupabasePublicConfig } from './content-source.js';
import { SUPABASE_PUBLIC_CONFIG } from './supabase-config.js';

export class CampaignPhotoProtectedError extends Error {
  constructor(message, code = 'CAMPAIGN_PHOTO_PROTECTED') {
    super(message);
    this.name = 'CampaignPhotoProtectedError';
    this.code = code;
  }
}

export async function assertCampaignPhotoCanChange({
  session,
  image,
  config = SUPABASE_PUBLIC_CONFIG,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!session?.access_token || !image?.storage_path) {
    throw new CampaignPhotoProtectedError('Brak aktywnej sesji lub ścieżki zdjęcia.', 'CAMPAIGN_GUARD_INVALID_INPUT');
  }
  const settings = resolveSupabasePublicConfig(config);
  if (!settings.configured || typeof fetchImpl !== 'function') {
    throw new CampaignPhotoProtectedError('Nie udało się sprawdzić przypisania zdjęcia.', 'CAMPAIGN_GUARD_UNAVAILABLE');
  }
  const url = new URL(`${settings.projectUrl}/rest/v1/campaign_level_images`);
  url.searchParams.set('select', 'level_id');
  url.searchParams.set('storage_path', `eq.${image.storage_path}`);
  url.searchParams.set('is_active', 'eq.true');
  url.searchParams.set('limit', '1');
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        apikey: settings.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        Accept: 'application/json'
      }
    });
  } catch {
    throw new CampaignPhotoProtectedError('Nie można sprawdzić powiązania z kampanią. Dla bezpieczeństwa operacja została anulowana.', 'CAMPAIGN_GUARD_NETWORK');
  }
  if (!response?.ok) {
    throw new CampaignPhotoProtectedError('Nie udało się sprawdzić powiązania z kampanią. Dla bezpieczeństwa operacja została anulowana.', 'CAMPAIGN_GUARD_HTTP');
  }
  let matches;
  try { matches = await response.json(); }
  catch {
    throw new CampaignPhotoProtectedError('Nie można odczytać przypisań zdjęć.', 'CAMPAIGN_GUARD_RESPONSE');
  }
  if (!Array.isArray(matches)) {
    throw new CampaignPhotoProtectedError('Nieprawidłowa odpowiedź z bazy.', 'CAMPAIGN_GUARD_RESPONSE');
  }
  if (matches.length) {
    throw new CampaignPhotoProtectedError(`To zdjęcie jest używane w poziomie ${matches[0].level_id} kampanii. Najpierw zmień jego przypisanie w bazie.`);
  }
  return true;
}
