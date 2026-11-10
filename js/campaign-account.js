/**
 * Minimal public Supabase Auth/Data API client for Campaign v0.9.0.
 * Only a publishable key is used. Tokens are stored locally on this device.
 * Server records are personal/provisional — NOT public ranked results.
 */
const SESSION_KEY = 'ai-or-human.campaign.account.session.v090';
function readStorage() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function writeStorage(session) {
  try { if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session)); else localStorage.removeItem(SESSION_KEY); } catch {}
}
export class CampaignAccountError extends Error {
  constructor(message, status) { super(message); this.name = 'CampaignAccountError'; this.status = status; }
}
export class CampaignAccount {
  constructor(config, fetchImpl = fetch) {
    this.projectUrl = config.projectUrl.replace(/\/$/, '');
    this.key = config.publishableKey;
    // Browser-native window.fetch requires the Window receiver in some browsers.
    // Invoking an extracted fetch as `this.fetchImpl(...)` would bind `this`
    // to CampaignAccount, causing `Illegal invocation` in Chrome/Edge/Brave.
    this.fetchImpl = (...args) => Reflect.apply(fetchImpl, globalThis, args);
    this.session = readStorage();
    this.user = null;
  }
  get signedIn() { return Boolean(this.session?.access_token && this.user?.id); }
  async request(path, { method = 'GET', body, authenticated = false, extraHeaders = {} } = {}) {
    if (authenticated) await this.refreshIfNeeded();
    const response = await this.fetchImpl(`${this.projectUrl}${path}`, {
      method, cache: 'no-store',
      headers: { apikey: this.key, 'Content-Type': 'application/json',
        ...(authenticated ? { Authorization: `Bearer ${this.session?.access_token || ''}` } : {}), ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new CampaignAccountError(data?.msg || data?.error_description || data?.message || `HTTP ${response.status}`, response.status);
    return data;
  }
  adoptSession(data) {
    if (!data?.access_token || !data?.refresh_token) return false;
    this.session = { access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + Math.max(0, Number(data.expires_in) || 3600) };
    writeStorage(this.session);
    this.user = data.user || null;
    return true;
  }
  async refreshIfNeeded() {
    if (!this.session) throw new CampaignAccountError('Zaloguj się do konta.', 401);
    if (this.session.expires_at > Date.now() / 1000 + 60) return;
    try {
      const data = await this.request('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', body: { refresh_token: this.session.refresh_token }
      });
      if (!this.adoptSession(data)) throw new Error('Brak nowej sesji');
    } catch (error) {
      this.session = null; this.user = null; writeStorage(null);
      throw new CampaignAccountError('Sesja wygasła. Zaloguj się ponownie.', 401);
    }
  }
  async restore() {
    if (!this.session) return null;
    try {
      await this.refreshIfNeeded();
      this.user = await this.request('/auth/v1/user', { authenticated: true });
      return this.user;
    } catch { this.user = null; this.session = null; writeStorage(null); return null; }
  }
  async signUp(email, password, nickname) {
    const data = await this.request(`/auth/v1/signup?redirect_to=${encodeURIComponent(`${location.origin}${location.pathname}`)}`, {method:'POST',body: {
      email, password, data: { nickname }
    }});
    if (this.adoptSession(data)) this.user = data.user || await this.request('/auth/v1/user', { authenticated: true });
    return Boolean(this.signedIn);
  }
  async signIn(email, password) {
    const data = await this.request('/auth/v1/token?grant_type=password', {method:'POST',body:{email,password}});
    if (!this.adoptSession(data)) throw new CampaignAccountError('Nie udało się uzyskać sesji.');
    this.user = data.user || await this.request('/auth/v1/user', { authenticated: true });
    return this.user;
  }
  async signOut() {
    if (this.session) {
      try { await this.request('/auth/v1/logout', {method:'POST',authenticated:true}); } catch {}
    }
    this.user = null; this.session = null; writeStorage(null);
  }
  async ensureProfile(nickname = null) {
    const encoded = encodeURIComponent(this.user.id);
    let rows = await this.request(`/rest/v1/campaign_player_profiles?user_id=eq.${encoded}&select=nickname`,{authenticated:true});
    if (rows[0]) return rows[0].nickname;
    const proposed = (nickname || this.user.user_metadata?.nickname || `Gracz_${this.user.id.slice(0,8)}`).trim();
    try {
      rows = await this.request('/rest/v1/campaign_player_profiles', {
        method:'POST',authenticated:true,body:{user_id:this.user.id,nickname:proposed},
        extraHeaders:{Prefer:'return=representation'}
      });
    } catch(error) {
      // A concurrent tab may have already created the same user's row.
      if (error.status !== 409) throw error;
      rows = await this.request(`/rest/v1/campaign_player_profiles?user_id=eq.${encoded}&select=nickname`,{authenticated:true});
    }
    return rows?.[0]?.nickname || proposed;
  }
  async snapshot() {
    const state = await this.request('/rest/v1/campaign_player_states?select=hearts,next_heart_at', {authenticated:true});
    const stages = await this.request('/rest/v1/campaign_player_scores?select=stage_id,kind,attempts,completed,best_points,best_elapsed_ms', {authenticated:true});
    return { state: state?.[0] || null, stages: stages || [] };
  }
  async begin(stageUid, kind) {
    return this.request('/rest/v1/rpc/campaign_player_begin', {
      method:'POST',authenticated:true,body:{p_stage_id:stageUid,p_kind:kind}
    });
  }
  async rankPrepare(attemptId) {
    return this.request('/rest/v1/rpc/campaign_rank_prepare', {
      method:'POST',authenticated:true,body:{p_attempt_id:attemptId}
    });
  }
  async rankReady(attemptId,cardIndex) {
    return this.request('/rest/v1/rpc/campaign_rank_ready', {
      method:'POST',authenticated:true,body:{p_attempt_id:attemptId,p_card_index:cardIndex}
    });
  }
  async rankAnswer(attemptId,cardIndex,choice) {
    return this.request('/rest/v1/rpc/campaign_rank_answer', {
      method:'POST',authenticated:true,body:{p_attempt_id:attemptId,p_card_index:cardIndex,p_choice:choice}
    });
  }
  async rankForfeit(attemptId,penalty=true) {
    return this.request('/rest/v1/rpc/campaign_rank_forfeit', {
      method:'POST',authenticated:true,body:{p_attempt_id:attemptId,p_penalty:penalty}
    });
  }
  async leaderboard(stageUid,kind) {
    return this.request('/rest/v1/rpc/campaign_stage_leaderboard', {
      method:'POST',authenticated:true,body:{p_stage_id:stageUid,p_kind:kind,p_limit:10}
    });
  }
  async resetTestProgress() {
    // Only the server can authorize this action; the UI's e-mail check
    // is merely a convenience and MUST NOT be treated as security.
    return this.request('/rest/v1/rpc/campaign_test_reset_my_progress', {
      method: 'POST', authenticated: true, body: {}
    });
  }
  async finish(attemptId, success, points, elapsedMs) {
    return this.request('/rest/v1/rpc/campaign_player_finish', {
      method:'POST',authenticated:true,
      body:{p_attempt_id:attemptId,p_success:success,p_points:points,p_elapsed_ms:elapsedMs}
    });
  }
}
