/**
 * v0.9.1.2 — Homepage account entry for Campaign.
 * Uses exactly the same CampaignAccount class + storage key as campaign.html.
 * No private credentials and no independent session handling.
 */
import { CampaignAccount } from './campaign-account.js?v=0.9.1.2';
import { resolveSupabasePublicConfig } from './content-source.js';

const $ = (selector) => document.querySelector(selector);
const dialog = $('#landing-account-dialog');
const trigger = $('#profile-button');
const caption = $('#landing-account-caption');
const form = $('#landing-account-form');
const message = $('#landing-account-message');
const modeSwitch = $('#landing-account-switch');
const submit = $('#landing-account-submit');
const signedPanel = $('#landing-account-signed');
const nicknameRow = $('#landing-account-nickname-row');
let account = null;
let nickname = '';
let mode = 'signin';
let busy = false;
let configError = '';

function setMessage(text, success = false) {
  message.textContent = text;
  message.classList.toggle('is-success', success);
}
function setMode(next) {
  mode = next === 'signup' ? 'signup' : 'signin';
  $('#landing-account-title').textContent = mode === 'signup' ? 'Utwórz konto' : 'Zaloguj się';
  $('#landing-account-intro').textContent = mode === 'signup'
    ? 'Załóż konto, aby zapisywać punkty i postępy na wielu urządzeniach.'
    : 'Zaloguj się, aby kontynuować kampanię ze swoim postępem.';
  nicknameRow.hidden = mode !== 'signup';
  $('#landing-account-nickname').required = mode === 'signup';
  $('#landing-account-password').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
  submit.textContent = mode === 'signup' ? 'Zarejestruj się' : 'Zaloguj się';
  modeSwitch.textContent = mode === 'signup' ? 'Masz konto? Zaloguj się' : 'Nie masz konta? Zarejestruj się';
  setMessage('');
}
function renderAccount() {
  const signed = Boolean(account?.signedIn);
  form.hidden = signed;
  modeSwitch.hidden = signed;
  signedPanel.hidden = !signed;
  trigger.classList.toggle('has-account', signed);
  // Do not trust nickname as markup. Set only textContent.
  caption.textContent = signed ? (nickname || 'Moje konto') : 'Zaloguj się';
  trigger.setAttribute('aria-label', signed ? `Konto gracza: ${nickname || 'zalogowano'}` : 'Zaloguj się lub utwórz konto gracza');
  trigger.title = signed ? `Konto: ${nickname || 'zalogowano'}` : 'Logowanie i rejestracja';
  $('#landing-account-title').textContent = signed ? 'Twoje konto' : (mode === 'signup' ? 'Utwórz konto' : 'Zaloguj się');
  if (signed) {
    $('#landing-account-display-name').textContent = nickname || 'Gracz';
    $('#landing-account-display-email').textContent = account.user.email || '';
    $('#landing-account-intro').textContent = 'Postęp i punkty w kampanii są zapisywane na Twoim koncie.';
  }
}
function openAccountDialog() {
  if (!dialog.open) dialog.showModal();
  renderAccount();
  if (!account && configError) setMessage(configError);
  if (account?.signedIn) $('#landing-account-signout').focus();
  else $('#landing-account-email').focus();
}
window.openCampaignLandingAccount = openAccountDialog;
$('#landing-account-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { $('#landing-account-password').value = ''; setMessage(''); });
modeSwitch.addEventListener('click', () => {
  if (busy) return;
  setMode(mode === 'signup' ? 'signin' : 'signup');
  renderAccount();
});
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  if (!account) { setMessage(configError || 'Nie skonfigurowano logowania w Supabase.'); return; }
  const email = $('#landing-account-email').value.trim();
  const password = $('#landing-account-password').value;
  const proposed = $('#landing-account-nickname').value.trim();
  busy = true;
  submit.disabled = true;
  modeSwitch.disabled = true;
  setMessage('');
  try {
    if (mode === 'signup') {
      // The destination must match Authentication > URL Configuration in Supabase.
      const redirectUrl = new URL('./campaign.html', location.href).href;
      const confirmed = await account.signUp(email, password, proposed, redirectUrl);
      if (!confirmed) {
        setMode('signin');
        setMessage('Sprawdź wiadomość e-mail, potwierdź rejestrację, a następnie zaloguj się.', true);
        return;
      }
    } else {
      await account.signIn(email, password);
    }
    nickname = await account.ensureProfile(proposed);
    form.reset();
    renderAccount();
    // Let the player choose whether to start the campaign; do not auto-navigate.
  } catch (error) {
    setMessage(error.message || 'Nie udało się zalogować.');
  } finally {
    busy = false;
    submit.disabled = false;
    modeSwitch.disabled = false;
  }
});
$('#landing-account-signout').addEventListener('click', async () => {
  if (!account || busy) return;
  busy = true;
  try {
    await account.signOut();
    nickname = '';
    setMode('signin');
    renderAccount();
    dialog.close();
  } finally { busy = false; }
});
async function restoreHomepageSession() {
  try {
    const config = resolveSupabasePublicConfig();
    if (!config.configured) {
      configError = 'Logowanie nie jest skonfigurowane. Kampania nadal działa bez konta.';
      renderAccount();
      return;
    }
    account = new CampaignAccount(config);
    if (await account.restore()) {
      try { nickname = await account.ensureProfile(); }
      catch (error) { console.warn('Konto zalogowane; błąd profilu:', error.message); }
    }
  } catch (error) {
    configError = `Nie można połączyć z logowaniem: ${error.message}`;
  }
  renderAccount();
}
void restoreHomepageSession();
