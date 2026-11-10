import {
  STAGES, STORAGE_KEY, HEART_REGEN_MIGRATION_KEY, MAX_HEARTS, BOSS_LIMIT_MS,
  newProgress, sanitizeProgress, migratePreviousCooldown, regenerate, takeHeart,
  completeStage, isStageUnlocked, shuffleImages, formatTime
} from "./campaign-core.js";
import { fetchCampaignStages, CampaignSourceError } from "./campaign-source.js?v=0.8.0";
import { resolveSupabasePublicConfig } from "./content-source.js";
import { readStableCompletedIds, completedCount, isStableStageUnlocked, markStableComplete, keepLiveFields } from "./campaign-progress.js";
import { createCampaignSounds } from "./campaign-sfx.js";
import { CampaignAccount } from "./campaign-account.js";
import { currentMultiplier, createScoreRun, addCorrectScore, secondsLabel, pointsLabel } from "./campaign-scoring.js";

const $ = (selector) => document.querySelector(selector);
const mapView = $("#campaign-map-view");
const playView = $("#campaign-play-view");
const resultView = $("#campaign-result-view");
const progressLabel = $("#progress-label");
const stops = $("#path-stops");
const card = $("#swipe-card");
const image = $("#campaign-image");
const feedback = $("#play-feedback");
const answerButtons = [$("#answer-human"), $("#answer-ai")];
const LIVE_STORAGE_KEY = "ai-or-human.campaign.live.v01";
const GUEST_ATTEMPT_KEY = "ai-or-human.campaign.attempts.v090";
let account = null;
let nickname = null;
let accountBusy = false;
let stageStartBusy = false;
let localAttempts = {};
let cloudAttempts = {};
try { localAttempts = JSON.parse(localStorage.getItem(GUEST_ATTEMPT_KEY) || '{}') || {}; } catch {}
function nextLocalAttempt(stage) {
  const key = String(stage.uid || stage.id);
  const attempt = Math.max(0, Number(localAttempts[key]) || 0) + 1;
  localAttempts[key] = attempt;
  try { localStorage.setItem(GUEST_ATTEMPT_KEY, JSON.stringify(localAttempts)); } catch {}
  return attempt;
}
function useCloud() { return Boolean(account?.signedIn && contentSource === 'supabase'); }
function applyRemoteHearts(state) {
  if (!state) return;
  progress = { ...progress, hearts: Number(state.hearts),
    nextHeartAt: state.next_heart_at ? Date.parse(state.next_heart_at) : null };
  redrawHearts();
}
async function loadAccountProgress() {
  if (!useCloud()) return;
  const snapshot = await account.snapshot();
  progress = { ...progress, completedStageIds: snapshot.stages.filter(s=>s.completed).map(s=>s.stage_id) };
  cloudAttempts = Object.fromEntries(snapshot.stages.map(s => [s.stage_id, Number(s.attempts) || 0]));
  applyRemoteHearts(snapshot.state || { hearts:3,next_heart_at:null });
  renderMap();
}
function refreshScoreHud() {
  if (!run?.score || screen!=='play') return;
  const elapsed = Math.max(0,performance.now() - (run.cardShownAt || performance.now()));
  $('#score-attempt').textContent = `Podejście ${run.score.attemptNumber}`;
  $('#score-multiplier').textContent = `×${currentMultiplier(run.score.attemptNumber,elapsed).toFixed(1)}`;
  $('#score-total').textContent = pointsLabel(run.score.points);
}
let toastTimeout;
function showScoreToast(score, onlineSaved = false) {
  const toast = $('#score-toast');
  if (toastTimeout) clearTimeout(toastTimeout);
  toast.replaceChildren();
  const title = document.createElement('strong'); title.textContent = `${pointsLabel(score.points)} · ${secondsLabel(score.answerMs)}`;
  const subtitle = document.createElement('small');
  subtitle.textContent = `Podejście ${score.attemptNumber} · ${onlineSaved ? 'Zapisano na Twoim koncie (wynik testowy)' : 'Wynik lokalny'} · Ranking wkrótce`;
  toast.append(title,subtitle);
  toast.hidden = false;
  requestAnimationFrame(()=>toast.classList.add('is-visible'));
  toastTimeout = setTimeout(()=>{toast.classList.remove('is-visible');setTimeout(()=>{toast.hidden=true;},380);},4400);
}

const mapScroller = $("#map-scroll");
const journey = $("#journey");
const unlockBanner = $("#map-unlock-banner");
const PATH_X = [50, 72, 29, 70, 32, 61];
const CHALLENGE_BRANCH_STEP = 'var(--challenge-step)';
let activeChallenges = [];
const UNLOCK_SCROLL_DELAY_MS = 850;
const UNLOCK_SHAKE_MS = 1500;
const UNLOCK_REVEAL_AT_MS = 900;
const UNLOCK_ANIMATION_MS = UNLOCK_SCROLL_DELAY_MS + UNLOCK_SHAKE_MS + 600;
const ANSWER_EFFECT_MS = 1120;
const sounds = createCampaignSounds();
let currentStorageKey = STORAGE_KEY;
let activeStages = STAGES;
let sourceLoading = false;
let contentSource = "demo";
let unlockState = null;
let unlockTimeout = null;
let unlockRevealTimeout = null;
let unlockSwapTimeout = null;
let layoutFrame = null;
let initialMapCentered = false;

function setContentNotice(text, demo = true) {
  const note = $("#campaign-source-note");
  const label = $("#campaign-source-text");
  label.textContent = text;
  note.dataset.source = demo ? "demo" : "supabase";
  $("#play-source-text").textContent = demo
    ? "Obrazy demonstracyjne: nie są to prawdziwe fotografie. Odpowiedź jest na karcie."
    : "Zdjęcia z osobnego Supabase. Rozpoznaj źródło obrazu.";
  $("#campaign-footer-source").textContent = demo ? "Dane lokalne • DEMO" : `Zdjęcia: Supabase • ${useCloud()?"postęp na koncie":"postęp lokalny"}`;
  $("#reset-demo").textContent = demo ? "Zresetuj testowy postęp" : "Zresetuj lokalny postęp";
}


function restoreProgress(key = STORAGE_KEY) {
  try {
    const raw = JSON.parse(localStorage.getItem(key));
    let stored = sanitizeProgress(raw);
    if (key === LIVE_STORAGE_KEY && Array.isArray(raw?.completedStageIds)) {
      stored.completedStageIds = raw.completedStageIds;
    }
    // One-time conversion of a v0.2 ten-minute cooldown to the new three-minute rule.
    // Keep the same storage key to preserve all completed levels and remaining hearts.
    if (key === STORAGE_KEY && localStorage.getItem(HEART_REGEN_MIGRATION_KEY) !== "done") {
      stored = migratePreviousCooldown(stored);
      localStorage.setItem(HEART_REGEN_MIGRATION_KEY, "done");
      localStorage.setItem(key, JSON.stringify(stored));
    }
    return keepLiveFields(regenerate(stored),stored);
  } catch { return newProgress(); }
}
let progress = restoreProgress();
let run = null;
let pendingAnswer = false;
let screen = "map";
let feedbackTimeout = null;
const soundToggles = [$("#sound-toggle"), $("#map-sound-toggle")];
function refreshSoundToggle() {
  const enabled = sounds.isEnabled();
  const action = enabled ? "Wyłącz dźwięki gry" : "Włącz dźwięki gry";
  for (const toggle of soundToggles) {
    toggle.setAttribute("aria-pressed", String(enabled));
    toggle.setAttribute("aria-label", action);
    toggle.title = action;
    toggle.querySelector(".sound-toggle__icon").textContent = enabled ? "🔊" : "🔇";
  }
}
for (const toggle of soundToggles) {
  toggle.addEventListener("click", () => { sounds.setEnabled(!sounds.isEnabled()); refreshSoundToggle(); });
}
refreshSoundToggle();

function save() {
  if (useCloud()) return; // Never overwrite the browser's guest save while signed in.
  try { localStorage.setItem(currentStorageKey, JSON.stringify(progress)); }
  catch { /* Storage may be disabled; demo continues for this tab only. */ }
}

function redrawHearts() {
  const heartsLabel = `${progress.hearts} z ${MAX_HEARTS} serc`;
  const heartsText = `${"♥ ".repeat(progress.hearts)}${"♡ ".repeat(MAX_HEARTS - progress.hearts)}`.trim();
  $("#map-hearts").textContent = heartsText;
  $("#map-hearts").setAttribute("aria-label", heartsLabel);
  $("#play-hearts").textContent = heartsText;
  $("#play-hearts").setAttribute("aria-label", heartsLabel);
  $("#map-recharge").textContent = progress.hearts === MAX_HEARTS
    ? "Wszystkie serca gotowe"
    : `Kolejne serce za ${formatTime(progress.nextHeartAt - Date.now())}`;
}

function syncTime() {
  const fresh = keepLiveFields(regenerate(progress), progress);
  if (fresh.hearts !== progress.hearts || fresh.nextHeartAt !== progress.nextHeartAt) {
    progress = fresh;
    save();
    if (screen === "map") renderMap();
  }
  redrawHearts();
  refreshScoreHud();
  if (screen === "play" && run?.stage.isBoss && run.deadline) {
    const remaining = Math.max(0, run.deadline - Date.now());
    $("#play-timer").textContent = formatTime(remaining);
    if (remaining === 0 && !pendingAnswer) loseRun("Czas minął! Walka z bossem zaczyna się od początku przy kolejnej próbie.", true);
  }
}

function setScreen(name) {
  const previousScreen = screen;
  screen = name;
  mapView.hidden = name !== "map";
  playView.hidden = name !== "play";
  resultView.hidden = name !== "result";
  if (name === "map") {
    renderMap();
    if (previousScreen !== 'map' && contentSource === 'supabase' && !unlockState) void initializeCampaignSource();
  }

}

/** The complete campaign is one continuous, vertically scrollable track. */
function renderMap() {
  progress = keepLiveFields(regenerate(progress), progress);
  redrawHearts();
  $('#sync-status-note').textContent = useCloud()
    ? 'Postęp i wyniki testowe są zapisywane na Twoim koncie.'
    : 'Bez konta postęp i punkty zostają na tym urządzeniu.';
  $('#reset-demo').hidden = useCloud();
  const doneCount = contentSource === 'supabase' ? completedCount(progress, activeStages) : progress.completed;
  const challengeDone = activeChallenges.filter(s=>(progress.completedStageIds || []).includes(s.uid)).length;
  progressLabel.textContent = `${doneCount} / ${activeStages.length}${activeChallenges.length ? ` · ✦ ${challengeDone}/${activeChallenges.length}` : ''}`;
  $("#world-label").textContent = `TWOJA ŚCIEŻKA • ${activeStages.length} ETAPÓW${activeChallenges.length ? ` · ${activeChallenges.length} CHALLENGE` : ''}`;
  // Challenges add extra scroll space BETWEEN main nodes, but never change main order.
  const challengeGroups = new Map();
  for (const challenge of activeChallenges) {
    const knownIndex=activeStages.findIndex(s=>s.uid===challenge.anchorUid);
    const anchorIndex=Math.max(0,knownIndex<0 ? activeStages.length-1 : knownIndex);
    if (!challengeGroups.has(anchorIndex)) challengeGroups.set(anchorIndex,[]);
    challengeGroups.get(anchorIndex).push(challenge);
  }
  journey.style.height = `calc(${Math.max(0,activeStages.length-1)} * var(--track-step) + ${activeChallenges.length} * var(--challenge-step) + var(--track-top) + var(--track-bottom))`;
  stops.replaceChildren();
  let branchesBefore = 0;
  activeStages.forEach((stage, index) => {
    const anchorBranchCount = challengeGroups.get(index)?.length || 0;
    const branchCountBeforeThis = branchesBefore;
    const done = contentSource === 'supabase' ? (progress.completedStageIds || []).includes(stage.uid) : stage.id <= progress.completed;
    const unlocked = contentSource === 'supabase' ? isStableStageUnlocked(progress, stage, activeStages) : isStageUnlocked(progress, stage.id);
    const item = document.createElement('li');
    item.className = `path-stop ${done ? 'path-stop--completed' : unlocked ? 'path-stop--available' : 'path-stop--locked'}`;
    item.dataset.stageUid = stage.uid || String(stage.id);
    item.style.setProperty('--stage-index', index);
    item.style.setProperty('--track-y', `calc(${index} * var(--track-step) + ${branchCountBeforeThis} * var(--challenge-step))`);
    item.style.setProperty('--stage-x', `${PATH_X[index % PATH_X.length]}%`);
    const uid = item.dataset.stageUid;
    const revealLocked = unlockState?.nextUid === uid && unlockState.phase !== 'revealed';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `path-node ${done ? 'path-node--completed' : (unlocked && !revealLocked) ? 'path-node--available' : 'path-node--locked'}${stage.isBoss ? ' path-node--boss' : ''}`;
    button.disabled = !unlocked || sourceLoading || revealLocked || unlockState?.nextUid === uid;
    const stageName = stage.isBoss ? 'Boss' : `Poziom ${stage.id}`;
    button.title = done ? `${stageName} ukończony — zagraj ponownie` : unlocked ? `Zagraj: ${stageName}` : 'Najpierw ukończ poprzednie poziomy';
    button.setAttribute('aria-label', revealLocked ? 'Trwa odblokowywanie poziomu' : button.title);
    const symbol = document.createElement('span');
    symbol.className = 'path-node__symbol';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = revealLocked || !unlocked ? '🔒' : stage.isBoss ? '♛' : done ? '★' : String(stage.id);
    // Diamond marker with a caption ribbon, inspired by the provided map reference.
    // The real symbol remains in the DOM for lock-to-unlocked animation and accessibility.
    const diamond = document.createElement('span');
    diamond.className = 'path-node__diamond';
    diamond.setAttribute('aria-hidden', 'true');
    diamond.append(symbol);
    const plate = document.createElement('span');
    plate.className = `path-node__plate${done ? ' path-node__plate--completed' : ''}`;
    plate.setAttribute('aria-hidden', 'true');
    const plateTitle = document.createElement('span');
    plateTitle.className = 'path-node__plate-title';
    plateTitle.textContent = stageName.toUpperCase();
    const plateNote = document.createElement('span');
    plateNote.className = 'path-node__plate-note';
    plateNote.textContent = done ? 'UKOŃCZONY · ZAGRAJ PONOWNIE'
      : revealLocked ? 'ODBLOCKOWYWANIE…'
      : !unlocked ? 'ZABLOKOWANY' : 'GRAJ';
    plate.append(plateTitle, plateNote);
    const pin = document.createElement('span');
    pin.className = 'path-node__pin';
    pin.setAttribute('aria-hidden', 'true');
    button.append(diamond, plate, pin);
    if (done) {
      const completedMark = document.createElement('span');
      completedMark.className = 'path-node__done-mark';
      completedMark.setAttribute('aria-hidden', 'true');
      completedMark.textContent = '✓';
      button.append(completedMark);
    }
    button.addEventListener('click', () => startStage(stage));
    const label = document.createElement('span');
    label.className = 'path-stop__title';
    label.textContent = stage.isBoss ? 'BOSS' : `Poziom ${stage.id}`;
    const subtitle = document.createElement('span');
    subtitle.className = 'path-stop__subtitle';
    subtitle.textContent = done ? 'Ukończony · zagraj ponownie' : revealLocked ? 'Odblokowywanie…' : !unlocked ? 'Zablokowany' : `${stage.images.length} kart · rozpocznij`;
    if (unlockState?.completedUid === uid && unlockState.phase === 'animating') item.classList.add('path-stop--just-completed');
    if (unlockState?.nextUid === uid) {
      item.classList.add(unlockState.phase === 'waiting' ? 'path-stop--unlock-pending' : 'path-stop--unlock-animating');
      if (unlockState.phase === 'revealed') item.classList.add('path-stop--unlock-revealed');
    }
    item.append(button, label, subtitle);
    stops.append(item);
    const branches=challengeGroups.get(index)||[];
    for (let branchIndex=0;branchIndex<branches.length;branchIndex++) {
      const challenge=branches[branchIndex];
      const finished=(progress.completedStageIds || []).includes(challenge.uid);
      const branch=document.createElement('li');
      branch.className=`path-stop path-stop--challenge ${finished?'path-stop--completed':'path-stop--available'}`;
      branch.dataset.stageUid=challenge.uid;
      branch.dataset.anchorUid=stage.uid || String(stage.id);
      branch.style.setProperty('--track-y',`calc(${index} * var(--track-step) + ${branchCountBeforeThis + branchIndex} * var(--challenge-step) + 106px)`);
      branch.style.setProperty('--stage-x',`${PATH_X[index % PATH_X.length] > 50 ? 13 : 87}%`);
      const challengeButton=document.createElement('button');
      challengeButton.type='button';
      challengeButton.className=`path-node path-node--challenge ${finished?'path-node--completed':'path-node--available'}`;
      challengeButton.disabled=sourceLoading;
      challengeButton.title=`Challenge Level: ${challenge.topic} · 20 kart · ${finished?'zagraj ponownie':'zagraj'}`;
      challengeButton.setAttribute('aria-label',challengeButton.title);
      const diamond=document.createElement('span');
      diamond.className='path-node__diamond';
      diamond.setAttribute('aria-hidden','true');
      const symbol=document.createElement('span');
      symbol.className='path-node__symbol';
      symbol.textContent='✦';
      diamond.append(symbol);
      const plate=document.createElement('span');
      plate.className='path-node__plate';
      plate.setAttribute('aria-hidden','true');
      const title=document.createElement('span'); title.className='path-node__plate-title'; title.textContent='CHALLENGE LEVEL';
      const note=document.createElement('span'); note.className='path-node__plate-note'; note.textContent=challenge.topic;
      plate.append(title,note);
      const pin=document.createElement('span'); pin.className='path-node__pin';pin.setAttribute('aria-hidden','true');
      challengeButton.append(diamond,plate,pin);
      if (finished) {
        const check=document.createElement('span');check.className='path-node__done-mark';check.textContent='✓';check.setAttribute('aria-hidden','true');challengeButton.append(check);
      }
      challengeButton.addEventListener('click',()=>startStage(challenge));
      branch.append(challengeButton);
      stops.append(branch);
    }
    branchesBefore+=anchorBranchCount;
  });
  requestJourneyLine();
  save();
}

function requestJourneyLine() {
  if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = null;
    updateJourneyLine();
  });
}

function updateJourneyLine() {
  if (screen !== 'map' || !journey.clientWidth) return;
  const rect = journey.getBoundingClientRect();
  const points = [...stops.querySelectorAll('.path-stop:not(.path-stop--challenge) .path-node')].map(node => {
    const box = node.getBoundingClientRect();
    return { x: box.left - rect.left + box.width / 2, y: box.top - rect.top + box.height / 2 };
  });
  const svg = $('#journey-line');
  svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const d = points.map((point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const halfY = (previous.y + point.y) / 2;
    return `C ${previous.x} ${halfY} ${point.x} ${halfY} ${point.x} ${point.y}`;
  }).join(' ');
  $('#journey-path').setAttribute('d', d);
  for (const oldBranch of svg.querySelectorAll('.journey-branch')) oldBranch.remove();
  for (const branch of stops.querySelectorAll('.path-stop--challenge')) {
    const from=findStageNode(branch.dataset.anchorUid);
    const to=branch.querySelector('.path-node');
    if (!from || !to) continue;
    const a=from.getBoundingClientRect(),b=to.getBoundingClientRect();
    const x1=a.left-rect.left+a.width/2,y1=a.top-rect.top+a.height/2;
    const x2=b.left-rect.left+b.width/2,y2=b.top-rect.top+b.height/2;
    const line=document.createElementNS('http://www.w3.org/2000/svg','path');
    line.setAttribute('class','journey-branch');
    line.setAttribute('d',`M ${x1} ${y1} Q ${(x1+x2)/2} ${(y1+y2)/2-40} ${x2} ${y2}`);
    svg.append(line);
  }
}

function findStageNode(uid) {
  return [...stops.children].find(item => item.dataset.stageUid === String(uid))?.querySelector('.path-node') || null;
}

function scrollMapToStage(uid, behavior = 'smooth', partnerUid = null) {
  const target = findStageNode(uid);
  if (!target) return;
  const targetRect = target.getBoundingClientRect();
  const viewportRect = mapScroller.getBoundingClientRect();
  let targetCenter = targetRect.top - viewportRect.top + mapScroller.scrollTop + targetRect.height / 2;
  const partner = partnerUid && findStageNode(partnerUid);
  if (partner) {
    const partnerRect = partner.getBoundingClientRect();
    const partnerCenter = partnerRect.top - viewportRect.top + mapScroller.scrollTop + partnerRect.height / 2;
    targetCenter = (targetCenter + partnerCenter) / 2;
  }
  const maxScroll = Math.max(0, mapScroller.scrollHeight - mapScroller.clientHeight);
  const destination = Math.max(0, Math.min(maxScroll, targetCenter - mapScroller.clientHeight / 2));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  mapScroller.scrollTo({ top: destination, behavior: reducedMotion ? 'instant' : behavior });
}

// v0.7.6: Animate the actual diamond using Web Animations instead of relying
// on CSS animation classes alone. The reveal is tied to a visible map marker.
function playDiamondEffect(item, kind = 'unlock') {
  const diamond = item?.querySelector('.path-node__diamond');
  if (!diamond || typeof diamond.animate !== 'function') return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  item.classList.add('path-stop--unlock-js');
  const base = 'translateX(-50%) rotate(45deg)';
  const frames = reduceMotion
    ? [
        { transform: base, filter: 'brightness(1)', opacity: 1 },
        { transform: base, filter: 'brightness(1.95)', opacity: 1, offset: .55 },
        { transform: base, filter: 'brightness(1.1)', opacity: 1 }
      ]
    : kind === 'replay'
      ? [
          { transform: `${base} scale(1)`, filter: 'brightness(1)' },
          { transform: `${base} scale(1.12)`, filter: 'brightness(1.8)', offset: .45 },
          { transform: `${base} scale(1)`, filter: 'brightness(1)' }
        ]
      : [
          { transform: `${base} translateX(0px) scale(1)`, filter: 'brightness(1)' },
          { transform: `${base} translateX(-11px) rotate(-6deg)`, filter: 'brightness(1.3)', offset: .15 },
          { transform: `${base} translateX(11px) rotate(6deg)`, filter: 'brightness(1.5)', offset: .25 },
          { transform: `${base} translateX(-10px) rotate(-5deg)`, filter: 'brightness(1.4)', offset: .37 },
          { transform: `${base} translateX(10px) rotate(5deg)`, filter: 'brightness(1.7)', offset: .49 },
          { transform: `${base} translateX(0px) scale(1.22)`, filter: 'brightness(2.1)', offset: .7 },
          { transform: `${base} scale(1)`, filter: 'brightness(1.1)' }
        ];
  // Keeping `fill: none` ensures no tilted or distorted number stays after the reveal.
  const animation = diamond.animate(frames, {
    duration: reduceMotion ? 650 : kind === 'replay' ? 850 : UNLOCK_SHAKE_MS,
    easing: 'ease-in-out', fill: 'none'
  });
  animation.addEventListener('finish', () => item.classList.remove('path-stop--unlock-js'), { once: true });
}

function ensureUnlockMarkerVisible(uid) {
  const node = findStageNode(uid);
  if (!node) return;
  const marker = node.getBoundingClientRect();
  const viewport = mapScroller.getBoundingClientRect();
  // On desktop smooth scrolling may take longer than the old fixed delay.
  // Never start an unlock offscreen: snap to the marker only if necessary.
  if (marker.top < viewport.top + 18 || marker.bottom > viewport.bottom - 18) {
    scrollMapToStage(uid, 'instant');
  }
}

function showUnlockOnMap(stage, nextStage, wasCompleted) {
  for (const id of [unlockTimeout, unlockRevealTimeout, unlockSwapTimeout]) {
    if (id !== null) window.clearTimeout(id);
  }
  unlockTimeout = unlockRevealTimeout = unlockSwapTimeout = null;
  const newlyUnlocked = !!(nextStage && !wasCompleted && !(contentSource === 'supabase'
    ? (progress.completedStageIds || []).includes(nextStage.uid)
    : nextStage.id <= progress.completed));
  const completedUid = stage.uid || String(stage.id);
  const nextUid = newlyUnlocked ? (nextStage.uid || String(nextStage.id)) : null;
  unlockState = { completedUid, nextUid, phase: 'waiting' };
  const currentState = unlockState;
  const completedName = stage.isChallenge ? `Challenge „${stage.topic}” ukończony!` : stage.isBoss ? 'Boss pokonany!' : `Poziom ${stage.id} ukończony!`;
  unlockBanner.textContent = newlyUnlocked
    ? `${completedName} Zaraz odblokujemy ${nextStage.isBoss ? 'kolejnego bossa' : `poziom ${nextStage.id}`}!`
    : `${completedName} ${wasCompleted ? 'Zaliczone ponownie!' : 'Wszystkie dostępne etapy ukończone!'}`;
  unlockBanner.hidden = false;
  clearRunTimers();
  run = null;
  setScreen('map');
  requestAnimationFrame(() => scrollMapToStage(nextUid || completedUid, 'smooth', nextUid ? completedUid : null));

  unlockRevealTimeout = window.setTimeout(() => {
    if (screen !== 'map' || unlockState !== currentState) return;
    const uid = nextUid || completedUid;
    ensureUnlockMarkerVisible(uid);
    // Allow the new scroll/layout to paint before starting on the desktop.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (screen !== 'map' || unlockState !== currentState) return;
      const item = [...stops.children].find(node => node.dataset.stageUid === uid);
      if (!item) return;
      unlockState.phase = 'animating';
      item.classList.remove('path-stop--unlock-pending');
      item.classList.add(nextUid ? 'path-stop--unlock-animating' : 'path-stop--just-completed');
      playDiamondEffect(item, nextUid ? 'unlock' : 'replay');
      if (!nextUid) return;
      unlockSwapTimeout = window.setTimeout(() => {
        if (screen !== 'map' || unlockState !== currentState) return;
        unlockState.phase = 'revealed';
        item.classList.add('path-stop--unlock-revealed');
        const button = item.querySelector('.path-node');
        const symbol = button?.querySelector('.path-node__symbol');
        if (button && symbol) {
          button.classList.replace('path-node--locked', 'path-node--available');
          symbol.textContent = nextStage.isBoss ? '♛' : String(nextStage.id);
          button.setAttribute('aria-label', 'Poziom odblokowany');
        }
        const plateNote = item.querySelector('.path-node__plate-note');
        if (plateNote) plateNote.textContent = 'ODBLOKOWANY · GRAJ';
        const subtitle = item.querySelector('.path-stop__subtitle');
        if (subtitle) subtitle.textContent = 'Odblokowano!';
        sounds.play('success');
        unlockSwapTimeout = null;
      }, UNLOCK_REVEAL_AT_MS);
    }));
    unlockRevealTimeout = null;
  }, UNLOCK_SCROLL_DELAY_MS);
  unlockTimeout = window.setTimeout(() => {
    if (unlockState !== currentState) return;
    unlockState = null;
    unlockBanner.hidden = true;
    unlockTimeout = null;
    if (screen === 'map') renderMap();
    if (screen === 'map' && contentSource === 'supabase') void initializeCampaignSource();
  }, UNLOCK_ANIMATION_MS);
}

// Native swipe/scroll on touch; grab-and-drag on desktop, without accidental level clicks.
let mapDrag = null;
let suppressMapClick = false;
mapScroller.addEventListener('pointerdown', event => {
  if (event.pointerType !== 'mouse' || event.button !== 0 || screen !== 'map') return;
  mapDrag = { id: event.pointerId, y: event.clientY, startScroll: mapScroller.scrollTop, moved: false };
});
mapScroller.addEventListener('pointermove', event => {
  if (!mapDrag || mapDrag.id !== event.pointerId) return;
  const diff = event.clientY - mapDrag.y;
  if (!mapDrag.moved && Math.abs(diff) < 7) return;
  if (!mapDrag.moved) {
    mapDrag.moved = true;
    mapScroller.classList.add('is-grabbing');
    try { mapScroller.setPointerCapture(event.pointerId); } catch {}
  }
  mapScroller.scrollTop = mapDrag.startScroll - diff;
});
function stopMapDrag(event) {
  if (!mapDrag || mapDrag.id !== event.pointerId) return;
  suppressMapClick = mapDrag.moved;
  mapDrag = null;
  mapScroller.classList.remove('is-grabbing');
  try { if (mapScroller.hasPointerCapture(event.pointerId)) mapScroller.releasePointerCapture(event.pointerId); } catch {}
  window.setTimeout(() => { suppressMapClick = false; }, 0);
}
mapScroller.addEventListener('pointerup', stopMapDrag);
mapScroller.addEventListener('pointercancel', stopMapDrag);
mapScroller.addEventListener('click', event => {
  if (!suppressMapClick) return;
  event.preventDefault();
  event.stopPropagation();
}, true);
mapScroller.addEventListener('dragstart', event => event.preventDefault());
window.addEventListener('resize', requestJourneyLine);

function clearSwipeVisual() {
  card.style.removeProperty('--drag-blur');
  card.style.removeProperty('--drag-offset');
  card.style.removeProperty('--drag-color-opacity');
  card.removeAttribute('data-swipe');
  card.style.transform = '';
  $("#swipe-human").style.opacity = '0';
  $("#swipe-ai").style.opacity = '0';
}

function applySwipeVisual(dx) {
  const amount = Math.min(1, Math.abs(dx) / 130);
  const direction = dx < 0 ? 'human' : dx > 0 ? 'ai' : null;
  if (!direction) { clearSwipeVisual(); return; }
  card.dataset.swipe = direction;
  // Image blurs progressively with horizontal travel; colored streak follows the chosen side.
  card.style.setProperty('--drag-blur', `${(amount * 10.5).toFixed(1)}px`);
  card.style.setProperty('--drag-offset', `${(dx * .09).toFixed(1)}px`);
  card.style.setProperty('--drag-color-opacity', String((amount * .85).toFixed(2)));
  card.style.transform = `translate3d(${Math.max(-140, Math.min(140, dx))}px, 0, 0)`;
  $("#swipe-human").style.opacity = direction === 'human' ? String(Math.min(1, amount * 1.7)) : '0';
  $("#swipe-ai").style.opacity = direction === 'ai' ? String(Math.min(1, amount * 1.7)) : '0';
}

function clearRunTimers() {
  if (feedbackTimeout !== null) window.clearTimeout(feedbackTimeout);
  feedbackTimeout = null;
  pendingAnswer = false;
  card.style.transform = "";
  card.classList.remove("is-dragging", "is-committed");
  clearSwipeVisual();
  $(".swipe-area").classList.remove("is-feedback-success", "is-feedback-error");
  $("#swipe-human").style.opacity = "0";
  $("#swipe-ai").style.opacity = "0";
  answerButtons.forEach((button) => { button.disabled = false; });
}

async function startStage(stage) {
  if (stageStartBusy) return;
  stageStartBusy = true;
  try { await beginStage(stage); }
  finally { stageStartBusy = false; }
}
async function beginStage(stage) {
  progress = keepLiveFields(regenerate(progress), progress);
  if (sourceLoading || (!stage.isChallenge && !(contentSource === 'supabase'
    ? isStableStageUnlocked(progress,stage,activeStages)
    : isStageUnlocked(progress,stage.id)))) return;
  if (progress.hearts === 0) {
    showResult("Brak serc", "Poczekaj na regenerację jednego serca, aby rozpocząć poziom od początku.", "♥", null);
    return;
  }
  let attemptNumber;
  let remoteAttemptId = null;
  if (useCloud()) {
    try {
      const entry = await account.begin(stage.uid,stage.isChallenge ? 'challenge' : 'main');
      attemptNumber = entry.attempt_number;
      remoteAttemptId = entry.attempt_id;
      cloudAttempts[stage.uid] = attemptNumber;
      applyRemoteHearts(entry);
    } catch (error) {
      unlockBanner.textContent = `Nie można rozpocząć poziomu na koncie: ${error.message}`;
      unlockBanner.hidden = false;
      return;
    }
  } else attemptNumber = nextLocalAttempt(stage);
  clearRunTimers();
  run = {
    score: createScoreRun(attemptNumber),
    remoteAttemptId,
    cardShownAt: performance.now(),
    stage,
    deck: shuffleImages(stage.images),
    index: 0,
    deadline: null,
    pausedTimeLeft: null,
    started: false
  };
  $("#play-title").textContent = stage.isBoss ? "Finałowa próba" : stage.title;
  $("#play-stage-label").textContent = stage.isChallenge ? 'CHALLENGE LEVEL' : stage.isBoss ? 'BOSS' : `POZIOM ${stage.id}`;
  $("#play-description").textContent = stage.isBoss
    ? "10 kart. Masz testowe 60 sekund na cały finał."
    : stage.isChallenge ? `Temat: ${stage.topic}. 20 kart, 10 AI i 10 HUMAN. Jeden błąd kończy podejście.`
    : "W lewo: człowiek. W prawo: AI. Jeden błąd kończy podejście.";
  $("#play-timer").hidden = !stage.isBoss;
  setScreen("play");
  showCard();
}

function showCard() {
  if (!run) return;
  // Hide the tiny transition from the held, displaced old card to the fresh new image.
  card.classList.add('is-card-switching');
  clearRunTimers();
  requestAnimationFrame(() => card.classList.remove('is-card-switching'));
  if (run.pausedTimeLeft !== null && run.deadline) {
    run.deadline = Date.now() + run.pausedTimeLeft;
    run.pausedTimeLeft = null;
  }
  const current = run.deck[run.index];
  run.cardShownAt = performance.now();
  refreshScoreHud();
  $("#play-counter").textContent = `${run.index + 1} / ${run.deck.length}`;
  $("#play-progress-bar").style.width = `${100 * run.index / run.deck.length}%`;
  feedback.textContent = "Wybierz odpowiedź albo przesuń kartę.";
  feedback.className = "play-feedback";
  image.alt = contentSource === "demo" ? `Oznaczona grafika demonstracyjna ${current.id}` : `Fotografia ${run.index+1}`;
  // Boss timer starts only once the first locally bundled image is ready.
  if (run.stage.isBoss && !run.started) {
    image.onload = () => {
      if (run) run.cardShownAt = performance.now();
      if (!run || run.started || !run.stage.isBoss) return;
      run.started = true;
      run.deadline = Date.now() + BOSS_LIMIT_MS;
    };
  } else image.onload = () => { if (run) run.cardShownAt = performance.now(); };
  image.onerror = () => {
    if (run && screen === "play") loseRun("Nie udało się wczytać karty testowej. Sprawdź kompletność plików w assets/campaign/demo.", false);
  };
  image.src = current.src;
  if (run.stage.isBoss && !run.started && image.complete && image.naturalWidth > 0) image.onload?.();
  redrawHearts();
}

function showResult(title, message, symbol, nextStage, primaryLabel = "Kontynuuj") {
  clearRunTimers();
  run = null;
  $("#result-title").textContent = title;
  $("#result-description").textContent = message;
  $("#result-symbol").textContent = symbol;
  const primary = $("#result-primary");
  primary.hidden = !nextStage;
  primary.textContent = nextStage ? primaryLabel : "";
  primary.onclick = nextStage ? () => startStage(nextStage) : null;
  setScreen("result");
}

function showCloudSaveError(error, context) {
  showResult('Błąd zapisu', `${context} nie został zapisany online: ${error.message}. Sprawdź połączenie i zaloguj się ponownie.`, '!', null);
}
async function winRun() {
  if (!run || run.finishing) return;
  run.finishing = true;
  const finishedRun = run;
  const stage = run.stage;
  let onlineSaved = false;
  if (useCloud() && finishedRun.remoteAttemptId) {
    try {
      const result = await account.finish(finishedRun.remoteAttemptId,true,
        finishedRun.score.points,finishedRun.score.answerMs);
      applyRemoteHearts(result);
      onlineSaved = true;
    } catch (error) {
      showCloudSaveError(error, 'Poziom ukończony, ale wynik');
      return;
    }
  }
  const wasCompleted = contentSource === 'supabase'
    ? (progress.completedStageIds || []).includes(stage.uid)
    : stage.id <= progress.completed;
  progress = contentSource === 'supabase' ? markStableComplete(progress, stage.uid) : completeStage(progress, stage.id);
  save();
  const nextStage = stage.isChallenge ? null :
    activeStages[activeStages.findIndex(s => (s.uid || String(s.id)) === (stage.uid || String(stage.id))) + 1] || null;
  showUnlockOnMap(stage, nextStage, wasCompleted);
  showScoreToast(finishedRun.score,onlineSaved);
}
async function loseRun(message, deductHeart) {
  if (!run || run.finishing) return;
  run.finishing = true;
  if (deductHeart && useCloud() && run.remoteAttemptId) {
    try {
      const result = await account.finish(run.remoteAttemptId,false,
        run.score.points,run.score.answerMs);
      applyRemoteHearts(result);
    } catch (error) {
      showResult('Błąd zapisu',`Nie udało się zapisać przegranej na koncie: ${error.message}`, '!',null);
      return;
    }
  } else if (deductHeart) progress = keepLiveFields(takeHeart(progress), progress);
  save();
  // One mistake ends the attempt. The next run starts at image 1 with a reshuffled full deck.
  const failedStage = run.stage;
  const noHearts = progress.hearts === 0;
  showResult(noHearts ? "Koniec serc" : "Runda przegrana",
    `${message} ${noHearts ? "Kolejne serce odnawia się za maksymalnie 3 minuty. Po regeneracji rozpocznij poziom od pierwszej karty." : "Ponowna próba zacznie się od pierwszej karty, w nowej kolejności."}`,
    "♡", noHearts ? null : failedStage, "Spróbuj ponownie");
}

function answer(type) {
  if (screen !== "play" || !run || pendingAnswer) return;
  if (run.stage.isBoss && run.deadline && Date.now() >= run.deadline) {
    loseRun("Czas minął.", true);
    return;
  }
  pendingAnswer = true;
  card.classList.remove('is-dragging');
  // A committed card holds its release position and directional tint for the
  // ENTIRE feedback interval. Keyboard/button answers also commit to one side.
  if (!card.hasAttribute('data-swipe')) applySwipeVisual(type === 'ai' ? 120 : -120);
  card.classList.add('is-committed');
  answerButtons.forEach((button) => { button.disabled = true; });
  // Stop the boss clock during feedback; the animation must not cost playing time.
  if (run.stage.isBoss && run.deadline) run.pausedTimeLeft = Math.max(0, run.deadline - Date.now());
  const responseMs = Math.max(0,Math.round(performance.now() - (run.cardShownAt || performance.now())));
  const correct = run.deck[run.index].type === type;
  if (correct) run.score = addCorrectScore(run.score,responseMs);
  else run.score.answerMs += responseMs;
  refreshScoreHud();
  const area = $(".swipe-area");
  area.classList.remove("is-feedback-success", "is-feedback-error");
  // A forced reflow allows two consecutive identical answers to replay the fade.
  void area.offsetWidth;
  area.classList.add(correct ? "is-feedback-success" : "is-feedback-error");
  sounds.play(correct ? "success" : "failure");
  const referenceRun = run;
  // Do not clearSwipeVisual() here: that previously snapped the card back after 310ms.
  // The card resets only when the next photo is installed or the view is dismissed.
  if (correct) {
    feedback.textContent = `Dobrze! +${run.score.lastAward} pkt`;
    feedback.className = "play-feedback is-success";
    feedbackTimeout = window.setTimeout(() => {
      if (run !== referenceRun || screen !== "play") return;
      run.index += 1;
      if (run.index >= run.deck.length) winRun(); else showCard();
    }, ANSWER_EFFECT_MS);
  } else {
    // Red fade first; only then deduct a heart and reveal the loss message.
    feedback.textContent = "";
    feedback.className = "play-feedback";
    feedbackTimeout = window.setTimeout(() => {
      if (run !== referenceRun || screen !== "play") return;
      loseRun("Błędna odpowiedź — tracisz jedno serce i kończysz to podejście.", true);
    }, ANSWER_EFFECT_MS);
  }
}

$("#answer-human").addEventListener("click", () => answer("human"));
$("#answer-ai").addEventListener("click", () => answer("ai"));
$("#back-to-map").addEventListener("click", () => { if (pendingAnswer) return; clearRunTimers(); run = null; setScreen("map"); });
$("#result-map").addEventListener("click", () => setScreen("map"));
$("#reset-demo").addEventListener("click", () => {
  if (useCloud()) return;
  if (!window.confirm("Czy na pewno wyzerować lokalny postęp kampanii i przywrócić 3 serca? Zmiana dotyczy tylko tej przeglądarki.")) return;
  progress = newProgress();
  save();
  renderMap();
});

document.addEventListener("keydown", (event) => {
  if (screen !== "play" || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    answer(event.key === "ArrowLeft" ? "human" : "ai");
  }
});

let dragStart = null;
card.addEventListener("pointerdown", (event) => {
  if (screen !== "play" || pendingAnswer || event.button !== 0) return;
  dragStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  card.classList.add("is-dragging");
  try { card.setPointerCapture(event.pointerId); } catch {}
});
card.addEventListener("pointermove", (event) => {
  if (!dragStart || dragStart.id !== event.pointerId) return;
  applySwipeVisual(event.clientX - dragStart.x);
});
function endDrag(event) {
  if (!dragStart || dragStart.id !== event.pointerId) return;
  const dx = event.clientX - dragStart.x;
  dragStart = null;
  card.classList.remove("is-dragging");
  if (Math.abs(dx) >= 75) {
    applySwipeVisual(dx);
    answer(dx > 0 ? "ai" : "human");
  } else clearSwipeVisual();
}
card.addEventListener("pointerup", endDrag);
card.addEventListener("pointercancel", endDrag);

renderMap();

async function initializeCampaignSource() {
  let config;
  try {
    config = resolveSupabasePublicConfig();
  } catch (error) {
    setContentNotice(`Błąd konfiguracji Supabase: ${error.message} Trwa tryb DEMO.`);
    return;
  }
  if (!config.configured) {
    setContentNotice("Tryb DEMO: brak konfiguracji Supabase. Karty są demonstracyjne, postęp jest lokalny.");
    return;
  }
  sourceLoading = true;
  setContentNotice("Łączenie z nowym Supabase… Poziomy zostaną udostępnione po sprawdzeniu danych.");
  renderMap();
  try {
    const loaded = await fetchCampaignStages({ config });
    if (loaded.ready) {
      const firstLoad = contentSource !== 'supabase';
      activeStages = loaded.stages;
      activeChallenges = loaded.challenges || [];
      contentSource = 'supabase';
      currentStorageKey = LIVE_STORAGE_KEY;
      if (firstLoad) {
        if (!account?.signedIn) progress = restoreProgress(LIVE_STORAGE_KEY);
        if (!Array.isArray(progress.completedStageIds)) {
          progress.completedStageIds = readStableCompletedIds(progress, activeStages);
          save();
        }
        initialMapCentered = false;
      }
      setContentNotice(`Zdjęcia z Supabase: ${loaded.count} kart w ${activeStages.length} etapach${activeChallenges.length ? ` + ${activeChallenges.length} Challenge` : ''}. Postęp zapisany lokalnie.`, false);
    } else {
      setContentNotice(`W Supabase nie ma jeszcze gotowych poziomów (${loaded.count} kart). Działa DEMO.`);
    }
  } catch (error) {
    const detail = error instanceof CampaignSourceError ? error.message : "Nie udało się pobrać zdjęć.";
    setContentNotice(`Supabase nie jest gotowy: ${detail} Działa DEMO.`);
  } finally {
    sourceLoading = false;
    renderMap();
    if (contentSource === 'supabase' && account?.signedIn) {
      try { await loadAccountProgress(); } catch (e) { console.warn('Account snapshot:',e.message); }
    }
    if (contentSource === 'supabase' && screen === 'map' && !initialMapCentered && !unlockState) {
      initialMapCentered = true;
      const current = activeStages.find(s => !(progress.completedStageIds || []).includes(s.uid)) || activeStages.at(-1);
      if (current) requestAnimationFrame(() => scrollMapToStage(current.uid || String(current.id), 'instant'));
    }
  }
}

// Auth is optional: guests continue using the existing browser save.
const accountDialog=$('#account-dialog');
let authMode='signin';
function setAuthMode(mode) {
  authMode=mode;
  $('#account-dialog-title').textContent=mode==='signup'?'Utwórz konto':'Konto gracza';
  $('#account-nickname-row').hidden=mode!=='signup';
  $('#account-nickname').required=mode==='signup';
  $('#account-submit').textContent=mode==='signup'?'Zarejestruj się':'Zaloguj';
  $('#account-mode-toggle').textContent=mode==='signup'?'Masz konto? Zaloguj się':'Nie masz konta? Zarejestruj się';
  $('#account-error').textContent='';
}
function renderAuthButton() {
  $('#account-open').textContent=account?.signedIn ? `👤 ${nickname || 'Moje konto'}` : '👤 Konto gracza';
  const signed=Boolean(account?.signedIn);
  $('#account-fields').hidden=signed;
  $('#account-submit').hidden=signed;
  $('#account-mode-toggle').hidden=signed;
  $('#account-signout').hidden=!signed;
  if (signed) {
    $('#account-explainer').textContent=`Zalogowano jako ${nickname || account.user.email}. Osobiste wyniki są na razie niezweryfikowane — ranking uruchomimy po zabezpieczeniu odpowiedzi.`;
  } else $('#account-explainer').textContent='Zaloguj się lub utwórz konto. Bez logowania nadal możesz grać z lokalnym postępem.';
}
$('#account-open').addEventListener('click',()=>{renderAuthButton();accountDialog.showModal();});
$('#account-close').addEventListener('click',()=>accountDialog.close());
$('#account-mode-toggle').addEventListener('click',()=>setAuthMode(authMode==='signin'?'signup':'signin'));
$('#account-signout').addEventListener('click',async()=>{
  if (account) await account.signOut();
  nickname=null;
  progress=restoreProgress(currentStorageKey);
  accountDialog.close();renderAuthButton();renderMap();
});
$('#account-form').addEventListener('submit',async event=>{
  event.preventDefault();
  if (!account || accountBusy) return;
  const email=$('#account-email').value.trim();
  const password=$('#account-password').value;
  const proposed=$('#account-nickname').value.trim();
  accountBusy=true; $('#account-submit').disabled=true; $('#account-error').textContent='';
  try {
    if (authMode==='signup') {
      const signed=await account.signUp(email,password,proposed);
      if (!signed) { $('#account-error').textContent='Sprawdź e-mail i potwierdź rejestrację, a następnie zaloguj się.'; setAuthMode('signin'); return; }
    } else await account.signIn(email,password);
    nickname=await account.ensureProfile(proposed);
    if (contentSource==='supabase') await loadAccountProgress();
    renderAuthButton(); accountDialog.close();renderMap();
  } catch (error) { $('#account-error').textContent=error.message; }
  finally { accountBusy=false;$('#account-submit').disabled=false; }
});
async function startup() {
  try {
    const config=resolveSupabasePublicConfig();
    if (config.configured) {
      account=new CampaignAccount(config);
      if (await account.restore()) {
        nickname=await account.ensureProfile();
      }
    }
  } catch(error) { console.warn('Optional account setup:',error.message); }
  renderAuthButton();
  await initializeCampaignSource();
}
void startup();
window.setInterval(syncTime, 250);
window.addEventListener("pageshow", () => {
  syncTime();
  if (contentSource === 'supabase' && screen === 'map') void initializeCampaignSource();
});
