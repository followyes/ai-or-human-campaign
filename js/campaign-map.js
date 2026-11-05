import {
  STAGES, STORAGE_KEY, HEART_REGEN_MIGRATION_KEY, MAX_HEARTS, BOSS_LIMIT_MS,
  newProgress, sanitizeProgress, migratePreviousCooldown, regenerate, takeHeart,
  completeStage, isStageUnlocked, shuffleImages, formatTime
} from "./campaign-core.js";
import { fetchCampaignStages, CampaignSourceError } from "./campaign-source.js";
import { resolveSupabasePublicConfig } from "./content-source.js";
import { readStableCompletedIds, completedCount, isStableStageUnlocked, markStableComplete, keepLiveFields } from "./campaign-progress.js";
import { createCampaignSounds } from "./campaign-sfx.js";

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
const mapScroller = $("#map-scroll");
const journey = $("#journey");
const unlockBanner = $("#map-unlock-banner");
const PATH_X = [50, 72, 29, 70, 32, 61];
const UNLOCK_SCROLL_DELAY_MS = 950;
const UNLOCK_SHAKE_MS = 1550;
const UNLOCK_ANIMATION_MS = UNLOCK_SCROLL_DELAY_MS + UNLOCK_SHAKE_MS + 1500;
const ANSWER_EFFECT_MS = 980;
const sounds = createCampaignSounds();
let currentStorageKey = STORAGE_KEY;
let activeStages = STAGES;
let sourceLoading = false;
let contentSource = "demo";
let unlockState = null;
let unlockTimeout = null;
let unlockRevealTimeout = null;
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
  $("#campaign-footer-source").textContent = demo ? "Dane lokalne • DEMO" : "Zdjęcia: Supabase • postęp lokalny";
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
const soundToggle = $("#sound-toggle");
function refreshSoundToggle() {
  const enabled = sounds.isEnabled();
  soundToggle.setAttribute("aria-pressed", String(enabled));
  soundToggle.setAttribute("aria-label", enabled ? "Wyłącz dźwięki gry" : "Włącz dźwięki gry");
  soundToggle.textContent = enabled ? "♫ Dźwięk: wł." : "♫ Dźwięk: wył.";
}
soundToggle.addEventListener("click", () => { sounds.setEnabled(!sounds.isEnabled()); refreshSoundToggle(); });
refreshSoundToggle();

function save() {
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
  const doneCount = contentSource === 'supabase' ? completedCount(progress, activeStages) : progress.completed;
  progressLabel.textContent = `${doneCount} / ${activeStages.length}`;
  $("#world-label").textContent = `TWOJA ŚCIEŻKA • ${activeStages.length} ETAPÓW`;
  journey.style.height = `calc(${Math.max(0, activeStages.length - 1)} * var(--track-step) + var(--track-top) + var(--track-bottom))`;
  stops.replaceChildren();
  activeStages.forEach((stage, index) => {
    const done = contentSource === 'supabase' ? (progress.completedStageIds || []).includes(stage.uid) : stage.id <= progress.completed;
    const unlocked = contentSource === 'supabase' ? isStableStageUnlocked(progress, stage, activeStages) : isStageUnlocked(progress, stage.id);
    const item = document.createElement('li');
    item.className = `path-stop ${done ? 'path-stop--completed' : unlocked ? 'path-stop--available' : 'path-stop--locked'}`;
    item.dataset.stageUid = stage.uid || String(stage.id);
    item.style.setProperty('--stage-index', index);
    item.style.setProperty('--stage-x', `${PATH_X[index % PATH_X.length]}%`);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `path-node ${done ? 'path-node--completed' : unlocked ? 'path-node--available' : 'path-node--locked'}${stage.isBoss ? ' path-node--boss' : ''}`;
    button.disabled = !unlocked || sourceLoading;
    button.title = unlocked ? `Zagraj: ${stage.isBoss ? 'Boss' : `Poziom ${stage.id}`}` : 'Najpierw ukończ poprzednie poziomy';
    button.setAttribute('aria-label', button.title);
    button.innerHTML = `<span class="path-node__symbol" aria-hidden="true">${!unlocked ? '♙' : stage.isBoss ? '♛' : done ? '★' : stage.id}</span>`;
    button.addEventListener('click', () => startStage(stage));
    const label = document.createElement('span');
    label.className = 'path-stop__title';
    label.textContent = stage.isBoss ? 'BOSS' : `Poziom ${stage.id}`;
    const subtitle = document.createElement('span');
    subtitle.className = 'path-stop__subtitle';
    subtitle.textContent = done ? 'Ukończony · zagraj ponownie' : !unlocked ? 'Zablokowany' : `${stage.images.length} kart · rozpocznij`;
    if (unlockState?.completedUid === item.dataset.stageUid && unlockState.phase === 'animating') item.classList.add('path-stop--just-completed');
    if (unlockState?.nextUid === item.dataset.stageUid) {
      item.classList.add(unlockState.phase === 'animating' ? 'path-stop--unlock-animating' : 'path-stop--unlock-pending');
      button.disabled = true; // No clicks until the lock reveal finishes.
    }
    item.append(button, label, subtitle);
    stops.append(item);
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
  const points = [...stops.querySelectorAll('.path-node')].map(node => {
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

function showUnlockOnMap(stage, nextStage, wasCompleted) {
  if (unlockTimeout !== null) clearTimeout(unlockTimeout);
  if (unlockRevealTimeout !== null) clearTimeout(unlockRevealTimeout);
  const newlyUnlocked = nextStage && !wasCompleted && !(contentSource === 'supabase'
    ? (progress.completedStageIds || []).includes(nextStage.uid)
    : nextStage.id <= progress.completed);
  unlockState = {
    completedUid: stage.uid || String(stage.id),
    nextUid: newlyUnlocked ? nextStage.uid || String(nextStage.id) : null,
    phase: 'waiting'
  };
  const completedName = stage.isBoss ? 'Boss pokonany!' : `Poziom ${stage.id} ukończony!`;
  unlockBanner.textContent = newlyUnlocked
    ? `${completedName} Odblokowano ${nextStage.isBoss ? 'kolejnego bossa' : `poziom ${nextStage.id}`}!`
    : `${completedName} ${wasCompleted ? 'Świetnie, zagraj ponownie!' : 'Wszystkie dostępne etapy ukończone!'}`;
  unlockBanner.hidden = false;
  clearRunTimers();
  run = null;
  setScreen('map');
  // The map moves into place BEFORE the locked icon starts trembling.
  requestAnimationFrame(() => scrollMapToStage(
    unlockState.nextUid || unlockState.completedUid,
    'smooth',
    unlockState.nextUid ? unlockState.completedUid : null
  ));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  unlockRevealTimeout = window.setTimeout(() => {
    if (screen !== 'map' || !unlockState) return;
    unlockState.phase = 'animating';
    const completedItem = [...stops.children].find(item => item.dataset.stageUid === unlockState.completedUid);
    completedItem?.classList.add('path-stop--just-completed');
    if (unlockState.nextUid) {
      const item = [...stops.children].find(node => node.dataset.stageUid === unlockState.nextUid);
      item?.classList.remove('path-stop--unlock-pending');
      item?.classList.add('path-stop--unlock-animating');
    }
    unlockRevealTimeout = null;
  }, reducedMotion ? 0 : UNLOCK_SCROLL_DELAY_MS);
  unlockTimeout = window.setTimeout(() => {
    unlockState = null;
    unlockBanner.hidden = true;
    stops.querySelectorAll('.path-stop--just-completed, .path-stop--unlock-pending, .path-stop--unlock-animating').forEach(item => {
      item.classList.remove('path-stop--just-completed', 'path-stop--unlock-pending', 'path-stop--unlock-animating');
      const button = item.querySelector('button');
      if (button && !sourceLoading) button.disabled = false;
    });
    unlockTimeout = null;
    if (screen === 'map') renderMap();
    // Refresh levels only after the reveal so its animation is never interrupted.
    if (screen === 'map' && contentSource === 'supabase') void initializeCampaignSource();
  }, reducedMotion ? 800 : UNLOCK_ANIMATION_MS);
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

function clearRunTimers() {
  if (feedbackTimeout !== null) window.clearTimeout(feedbackTimeout);
  feedbackTimeout = null;
  pendingAnswer = false;
  card.style.transform = "";
  card.classList.remove("is-dragging");
  $(".swipe-area").classList.remove("is-feedback-success", "is-feedback-error");
  $("#swipe-human").style.opacity = "0";
  $("#swipe-ai").style.opacity = "0";
  answerButtons.forEach((button) => { button.disabled = false; });
}

function startStage(stage) {
  progress = keepLiveFields(regenerate(progress), progress);
  if (sourceLoading || !(contentSource === 'supabase'
    ? isStableStageUnlocked(progress,stage,activeStages)
    : isStageUnlocked(progress,stage.id))) return;
  if (progress.hearts === 0) {
    showResult("Brak serc", "Poczekaj na regenerację jednego serca, aby rozpocząć poziom od początku.", "♥", null);
    return;
  }
  clearRunTimers();
  run = {
    stage,
    deck: shuffleImages(stage.images),
    index: 0,
    deadline: null,
    pausedTimeLeft: null,
    started: false
  };
  $("#play-title").textContent = stage.isBoss ? "Finałowa próba" : stage.title;
  $("#play-stage-label").textContent = stage.isBoss ? "BOSS" : `POZIOM ${stage.id}`;
  $("#play-description").textContent = stage.isBoss
    ? "10 kart. Masz testowe 60 sekund na cały finał."
    : "W lewo: człowiek. W prawo: AI. Jeden błąd kończy podejście.";
  $("#play-timer").hidden = !stage.isBoss;
  setScreen("play");
  showCard();
}

function showCard() {
  if (!run) return;
  clearRunTimers();
  if (run.pausedTimeLeft !== null && run.deadline) {
    run.deadline = Date.now() + run.pausedTimeLeft;
    run.pausedTimeLeft = null;
  }
  const current = run.deck[run.index];
  $("#play-counter").textContent = `${run.index + 1} / ${run.deck.length}`;
  $("#play-progress-bar").style.width = `${100 * run.index / run.deck.length}%`;
  feedback.textContent = "Wybierz odpowiedź albo przesuń kartę.";
  feedback.className = "play-feedback";
  image.alt = contentSource === "demo" ? `Oznaczona grafika demonstracyjna ${current.id}` : `Fotografia ${run.index+1}`;
  // Boss timer starts only once the first locally bundled image is ready.
  if (run.stage.isBoss && !run.started) {
    image.onload = () => {
      if (!run || run.started || !run.stage.isBoss) return;
      run.started = true;
      run.deadline = Date.now() + BOSS_LIMIT_MS;
    };
  } else image.onload = null;
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

function winRun() {
  if (!run) return;
  const stage = run.stage;
  const wasCompleted = contentSource === 'supabase'
    ? (progress.completedStageIds || []).includes(stage.uid)
    : stage.id <= progress.completed;
  progress = contentSource === 'supabase' ? markStableComplete(progress, stage.uid) : completeStage(progress, stage.id);
  save();
  const nextStage = activeStages[activeStages.findIndex(s => (s.uid || String(s.id)) === (stage.uid || String(stage.id))) + 1] || null;
  showUnlockOnMap(stage, nextStage, wasCompleted);
}
function loseRun(message, deductHeart) {
  if (!run) return;
  if (deductHeart) progress = keepLiveFields(takeHeart(progress), progress);
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
  answerButtons.forEach((button) => { button.disabled = true; });
  // Stop the boss clock during feedback; the animation must not cost playing time.
  if (run.stage.isBoss && run.deadline) run.pausedTimeLeft = Math.max(0, run.deadline - Date.now());
  const correct = run.deck[run.index].type === type;
  const area = $(".swipe-area");
  area.classList.remove("is-feedback-success", "is-feedback-error");
  // A forced reflow allows two consecutive identical answers to replay the fade.
  void area.offsetWidth;
  area.classList.add(correct ? "is-feedback-success" : "is-feedback-error");
  sounds.play(correct ? "success" : "failure");
  const referenceRun = run;
  if (correct) {
    feedback.textContent = "Dobrze!";
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
  const dx = Math.max(-140, Math.min(140, event.clientX - dragStart.x));
  card.style.transform = `translateX(${dx}px) rotate(${dx * .042}deg)`;
  $("#swipe-human").style.opacity = String(Math.min(1, Math.max(0, -dx / 80)));
  $("#swipe-ai").style.opacity = String(Math.min(1, Math.max(0, dx / 80)));
});
function endDrag(event) {
  if (!dragStart || dragStart.id !== event.pointerId) return;
  const dx = event.clientX - dragStart.x;
  dragStart = null;
  card.classList.remove("is-dragging");
  card.style.transform = "";
  $("#swipe-human").style.opacity = "0";
  $("#swipe-ai").style.opacity = "0";
  if (Math.abs(dx) >= 75) answer(dx > 0 ? "ai" : "human");
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
      contentSource = 'supabase';
      currentStorageKey = LIVE_STORAGE_KEY;
      if (firstLoad) {
        progress = restoreProgress(LIVE_STORAGE_KEY);
        if (!Array.isArray(progress.completedStageIds)) {
          progress.completedStageIds = readStableCompletedIds(progress, activeStages);
          save();
        }
        initialMapCentered = false;
      }
      setContentNotice(`Zdjęcia z Supabase: ${loaded.count} kart w ${activeStages.length} etapach. Postęp zapisany lokalnie.`, false);
    } else {
      setContentNotice(`W Supabase nie ma jeszcze gotowych poziomów (${loaded.count} kart). Działa DEMO.`);
    }
  } catch (error) {
    const detail = error instanceof CampaignSourceError ? error.message : "Nie udało się pobrać zdjęć.";
    setContentNotice(`Supabase nie jest gotowy: ${detail} Działa DEMO.`);
  } finally {
    sourceLoading = false;
    renderMap();
    if (contentSource === 'supabase' && screen === 'map' && !initialMapCentered && !unlockState) {
      initialMapCentered = true;
      const current = activeStages.find(s => !(progress.completedStageIds || []).includes(s.uid)) || activeStages.at(-1);
      if (current) requestAnimationFrame(() => scrollMapToStage(current.uid || String(current.id), 'instant'));
    }
  }
}

void initializeCampaignSource();
window.setInterval(syncTime, 250);
window.addEventListener("pageshow", () => {
  syncTime();
  if (contentSource === 'supabase' && screen === 'map') void initializeCampaignSource();
});
