import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CampaignAccount } from '../js/campaign-account.js';

const html = readFileSync(new URL('../campaign.html', import.meta.url), 'utf8');
const map = readFileSync(new URL('../js/campaign-map.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/campaign.css', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../../SUPABASE_SQL/11_test_account_reset_v0902.sql', import.meta.url), 'utf8');

for (const id of ['test-account-reset', 'level-celebration','celebration-confetti', 'celebration-title','celebration-points','score-toast']) {
  assert.match(html,new RegExp(`id="${id}"`));
}
assert.match(map, /prepareUnlockOnMap\(stage, nextStage, wasCompleted\)/);
assert.match(map, /showCompletionCelebration\(stage, finishedRun\.score, startUnlockAfterReturn\)/);
assert.match(map, /showScoreToast\(finishedRun\.score,onlineSaved\)/);
assert.match(map, /UNLOCK_ANIMATION_MS\)/);
assert.match(map, /localStorage\.removeItem\(GUEST_ATTEMPT_KEY\)/);
assert.match(css, /\.level-celebration\.is-leaving/);
assert.match(css, /@keyframes celebration-shower/);
assert.match(css, /prefers-reduced-motion:reduce/);

// The public button is *not* the authorization boundary. The SQL RPC is.
assert.match(sql, /SECURITY DEFINER/);
assert.match(sql, /SET search_path = ''/);
assert.match(sql, /v_email IS DISTINCT FROM 'admin@followyes\.pl'/);
assert.match(sql, /public\.campaign_admins WHERE user_id = v_user/);
assert.match(sql, /DELETE FROM public\.campaign_player_attempts WHERE user_id = v_user/);
assert.match(sql, /DELETE FROM public\.campaign_player_scores WHERE user_id = v_user/);
assert.match(sql, /DELETE FROM public\.campaign_player_states WHERE user_id = v_user/);
assert.doesNotMatch(sql, /DELETE FROM public\.campaign_player_profiles/);
assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.campaign_test_reset_my_progress\(\) TO authenticated/);

let called = false;
const api = new CampaignAccount({projectUrl:'https://example.supabase.co',publishableKey:'sb_publishable_test'},
  async function(url,opts) {
    called = true;
    assert.equal(this,globalThis);
    assert.match(url,/\/rest\/v1\/rpc\/campaign_test_reset_my_progress$/);
    assert.equal(opts.method,'POST');
    assert.equal(opts.headers.Authorization,'Bearer example-access-token');
    return {ok:true,status:200,json:async()=>({ok:true,hearts:3,attempts:0})};
  });
api.session = {access_token:'example-access-token',refresh_token:'example-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600};
api.user = {id:'123',email:'admin@followyes.pl'};
const result = await api.resetTestProgress();
assert.equal(called,true);
assert.equal(result.attempts,0);
console.log('PASS: v0.9.0.2 protected reset RPC client, celebration ordering and DOM hooks');
