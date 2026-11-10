import assert from 'node:assert/strict';
import { CampaignAccount } from '../js/campaign-account.js';

const originalFetch = globalThis.fetch;
const originalLocation = globalThis.location;
let called = 0;
try {
  // Mimic a browser fetch rejecting calls with the wrong receiver.
  globalThis.location = { origin: 'https://example.github.io', pathname: '/ai-or-human-campaign/campaign.html' };
  globalThis.fetch = function (url, options) {
    assert.equal(this, globalThis, 'fetch must be invoked with the global/window receiver');
    assert.match(url, /\/auth\/v1\/signup\?/);
    assert.equal(options.method, 'POST');
    assert.equal(JSON.parse(options.body).email, 'tester@example.test');
    called++;
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ user: { id: 'test-user' } }) });
  };
  const account = new CampaignAccount({ projectUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' });
  const signed = await account.signUp('tester@example.test', 'password123', 'Tester');
  assert.equal(signed, false, 'email-confirmation sign-up should await confirmation');
  assert.equal(called, 1, 'signup should make exactly one request');

  // An injected fetch implementation also receives the expected receiver.
  let injected = false;
  const customFetch = function () {
    assert.equal(this, globalThis);
    injected = true;
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
  };
  const custom = new CampaignAccount({ projectUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_test' }, customFetch);
  const response = await custom.request('/test');
  assert.deepEqual(response, { ok: true });
  assert.equal(injected, true);
  console.log('PASS: browser fetch receiver and email-confirmation registration');
} finally {
  globalThis.fetch = originalFetch;
  if (originalLocation === undefined) delete globalThis.location;
  else globalThis.location = originalLocation;
}
