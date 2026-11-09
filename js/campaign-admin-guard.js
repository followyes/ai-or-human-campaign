/**
 * Before destructive edits, inform the admin which full stage will be removed.
 * The actual cascade is enforced in Postgres, NOT by trusting this browser.
 */
import { resolveSupabasePublicConfig } from './content-source.js';
import { SUPABASE_PUBLIC_CONFIG } from './supabase-config.js';

export class CampaignPhotoProtectedError extends Error {
  constructor(message,code='CAMPAIGN_GUARD_UNAVAILABLE') {
    super(message);this.name='CampaignPhotoProtectedError';this.code=code;
  }
}
export async function getCampaignPhotoImpact({session,image,config=SUPABASE_PUBLIC_CONFIG,fetchImpl=globalThis.fetch}={}) {
  if (!session?.access_token || !image?.storage_path) throw new CampaignPhotoProtectedError('Brak sesji lub ścieżki zdjęcia.');
  const settings=resolveSupabasePublicConfig(config);
  if (!settings.configured || typeof fetchImpl!=='function') throw new CampaignPhotoProtectedError('Nie można sprawdzić poziomu.');
  const url=new URL(`${settings.projectUrl}/rest/v1/campaign_public_cards`);
  url.searchParams.set('select','stage_id,display_number,kind');
  url.searchParams.set('storage_path',`eq.${image.storage_path}`);
  url.searchParams.set('limit','1');
  let response;
  try { response=await fetchImpl(url,{method:'GET',cache:'no-store',headers:{apikey:settings.publishableKey,Authorization:`Bearer ${session.access_token}`,Accept:'application/json'}}); }
  catch { throw new CampaignPhotoProtectedError('Nie udało się sprawdzić przypisania zdjęcia.'); }
  if (!response?.ok) throw new CampaignPhotoProtectedError(`Sprawdzenie poziomu nie powiodło się (HTTP ${response?.status || '?'}).`);
  let rows;
  try {rows=await response.json();} catch {throw new CampaignPhotoProtectedError('Nieprawidłowa odpowiedź z bazy.');}
  if (!Array.isArray(rows)) throw new CampaignPhotoProtectedError('Nieprawidłowa odpowiedź z bazy.');
  if (rows[0]) return rows[0];
  const challengeUrl=new URL(`${settings.projectUrl}/rest/v1/campaign_public_challenge_cards`);
  challengeUrl.searchParams.set('select','stage_id,challenge_number,topic_name');
  challengeUrl.searchParams.set('storage_path',`eq.${image.storage_path}`);
  challengeUrl.searchParams.set('limit','1');
  let challengeResponse;
  try {challengeResponse=await fetchImpl(challengeUrl,{method:'GET',cache:'no-store',headers:{
    apikey:settings.publishableKey,Authorization:`Bearer ${session.access_token}`,Accept:'application/json'
  }});} catch {throw new CampaignPhotoProtectedError('Nie można sprawdzić wyzwania zdjęcia.');}
  if (challengeResponse?.status===404) return null;
  if (!challengeResponse?.ok) throw new CampaignPhotoProtectedError(`Sprawdzenie Challenge: HTTP ${challengeResponse?.status || '?'}.`);
  let challengeRows;
  try {challengeRows=await challengeResponse.json();} catch {throw new CampaignPhotoProtectedError('Nieprawidłowy status wyzwania.');}
  if (!Array.isArray(challengeRows)) throw new CampaignPhotoProtectedError('Nieprawidłowe dane wyzwania.');
  return challengeRows[0] ? {...challengeRows[0],kind:'challenge',display_number:challengeRows[0].challenge_number} : null;
}
// Stary eksport zachowany dla kompatybilności z poprzednimi testami/kodem.
export async function assertCampaignPhotoCanChange(options) {
  await getCampaignPhotoImpact(options);
  return true;
}
