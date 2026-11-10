import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CampaignAccount } from '../js/campaign-account.js';
const base = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, base), 'utf8');
const home = read('index.html');
const alias = read('classic.html');
const css = read('css/style.css');
const campaign = read('campaign.html');
const campaignCss = read('css/campaign.css');
const map = read('js/campaign-map.js');
const main = read('js/game.js');
const landing = read('js/landing-account.js');
const accountJs = read('js/campaign-account.js');
for (const html of [home, alias]) {
  for (const id of ['profile-button','landing-account-caption','landing-account-dialog','landing-account-form','landing-account-email','landing-account-password','landing-account-nickname-row','landing-account-switch','landing-account-submit','landing-account-signed','landing-account-display-name','landing-account-signout']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /landing-account\.js\?v=0\.9\.1\.4/);
  assert.match(html, /game\.js\?v=0\.9\.1\.4/);
  assert.match(html, /style\.css\?v=0\.9\.1\.4/);
  assert.match(html, /href="\.\/campaign\.html"/, 'guest path remains available');
  assert.match(html, /Przejdź do mapy gry/);
  assert.match(html, /campaign-play-cta/);
  assert.doesNotMatch(html, /5 poziomów, boss i 3 serca/);
  assert.match(html, /id="landing-account-dialog"[^>]*aria-labelledby="landing-account-title"/);
}
assert.match(css,/landing-account-dialog/);
assert.match(css,/landing-account-nickname-row\[hidden\]/);
assert.match(main,/window\.openCampaignLandingAccount\?\.\(\)/);
assert.match(landing,/account\.ensureProfile/);
assert.match(landing,/account\.restore\(\)/);
assert.match(landing,/account\.signOut\(\)/);
assert.match(landing,/account\.signIn\(email, password\)/);
assert.match(landing,/account\.signUp\(email, password, proposed, redirectUrl\)/);
assert.match(landing,/new URL\('\.\/campaign\.html', location\.href\)/);
assert.match(landing,/window\.openCampaignLandingAccount = openAccountDialog/);
assert.match(landing,/textContent = account\.user\.email/);
assert.doesNotMatch(landing,/innerHTML/);
assert.match(campaign, /id="reset-demo"[^>]*hidden/);
assert.match(campaignCss, /#reset-demo\s*\{\s*display:none!important/);
assert.match(map, /\$\('#reset-demo'\)\.hidden\s*=\s*true/);
assert.match(map,/account\.user\?\.email\?\.toLowerCase\(\) === TEST_RESET_EMAIL/);
assert.match(map,/testResetButton\.hidden = !show/);
assert.match(accountJs, /rpc\/campaign_test_reset_my_progress/);
assert.match(campaign, /campaign-map\.js\?v=0\.9\.1\.5/);
// The signup redirect on the homepage is explicitly the already allowlisted campaign.html,
// rather than the homepage which might not be present in Supabase redirect URLs.
let requested = '';
const fakeFetch = async (url) => {
  requested = url;
  return { ok: true, status: 200, json: async () => ({ user: { id:'u1' } }) };
};
const client = new CampaignAccount({projectUrl:'https://unit.test',publishableKey:'sb_publishable_unit'},fakeFetch);
const signed = await client.signUp('test@example.test','password123','Tester','https://followyes.github.io/ai-or-human-campaign/campaign.html');
assert.equal(signed,false, 'email-confirmation flow is preserved');
assert.match(requested, /redirect_to=https%3A%2F%2Ffollowyes\.github\.io%2Fai-or-human-campaign%2Fcampaign\.html/);
console.log('PASS v0.9.1.2: homepage shared account entry, allowed confirmation redirect, admin-only reset UI');
