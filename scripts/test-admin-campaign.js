import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CampaignPhotoProtectedError,
  assertCampaignPhotoCanChange
} from '../js/campaign-admin-guard.js';

const config = { projectUrl: 'https://new-campaign-001.supabase.co', publishableKey: 'sb_publishable_test' };
const session = { access_token: 'test-admin-jwt' };
const image = { storage_path: 'ai/used.avif' };
let request;
assert.equal(await assertCampaignPhotoCanChange({
  session, image, config,
  fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok:true, json: async () => [] };
  }
}), true);
assert.equal(request.url.searchParams.get('storage_path'), 'eq.ai/used.avif');
assert.equal(request.options.headers.Authorization, 'Bearer test-admin-jwt');
await assert.rejects(
  () => assertCampaignPhotoCanChange({session, image, config, fetchImpl: async () => ({ok: true, json: async () => [{level_id: 3}]})}),
  e => e instanceof CampaignPhotoProtectedError && e.message.includes('poziomie 3')
);
await assert.rejects(
  () => assertCampaignPhotoCanChange({session, image, config, fetchImpl: async () => ({ok:false, status:403})}),
  e => e.code === 'CAMPAIGN_GUARD_HTTP'
);
await assert.rejects(
  () => assertCampaignPhotoCanChange({session, image, config, fetchImpl: async () => { throw new Error('connection'); }}),
  e => e.code === 'CAMPAIGN_GUARD_NETWORK'
);
const code = readFileSync(new URL('../admin/admin.js', import.meta.url), 'utf8');
assert.match(code, /await assertCampaignPhotoCanChange\(\{ session: currentSession, image \}\)/);
assert.equal((code.match(/await assertCampaignPhotoCanChange/g) || []).length, 3, 'single delete, bulk delete, bulk move are protected');
const adminHtml = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
assert.match(adminHtml, /id="login-form"/);
assert.match(adminHtml, /id="inventory-grid"/);
assert.match(adminHtml, /id="tab-results"/);
console.log('admin campaign guard: checks PASSED');
