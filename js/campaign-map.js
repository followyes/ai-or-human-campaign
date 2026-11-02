import {
  STAGES, STORAGE_KEY, HEART_REGEN_MIGRATION_KEY, MAX_HEARTS, BOSS_LIMIT_MS,
  newProgress, sanitizeProgress, migratePreviousCooldown, regenerate, takeHeart,
  completeStage, isStageUnlocked, shuffleImages, formatTime
} from "./campaign-core.js";

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

function restoreProgress() {
  try {
    let stored = sanitizeProgress(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    // One-time conversion of a v0.2 ten-minute cooldown to the new three-minute rule.
    // Keep the same storage key to preserve all completed levels and remaining hearts.
    if (localStorage.getItem(HEART_REGEN_MIGRATION_KEY) !== "done") {
      stored = migratePreviousCooldown(stored);
      localStorage.setItem(HEART_REGEN_MIGRATION_KEY, "done");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    }
    return regenerate(stored);
  } catch { return newProgress(); }
}
let progress = restoreProgress();
let run = null;
let pendingAnswer = false;
let screen = "map";
let feedbackTimeout = null;

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
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
  const fresh = regenerate(progress);
  if (fresh.hearts !== progress.hearts || fresh.nextHeartAt !== progress.nextHeartAt) {
    progress = fresh;
    save();
    if (screen === "map") renderMap();
  }
  redrawHearts();
  if (screen === "play" && run?.stage.isBoss && run.deadline) {
    const remaining = Math.max(0, run.deadline - Date.now());
    $("#play-timer").textContent = formatTime(remaining);
    if (remaining === 0) loseRun("Czas minął! Walka z bossem zaczyna się od początku przy kolejnej próbie.", true);
  }
}

function setScreen(name) {
  screen = name;
  mapView.hidden = name !== "map";
  playView.hidden = name !== "play";
  resultView.hidden = name !== "result";
  if (name === "map") renderMap();

}

function renderMap() {
  progress = regenerate(progress);
  redrawHearts();
  progressLabel.textContent = `${progress.completed} / 6`;
  stops.replaceChildren();
  STAGES.forEach((stage) => {
    const done = stage.id <= progress.completed;
    const unlocked = isStageUnlocked(progress, stage.id);
    const item = document.createElement("li");
    item.className = `path-stop ${done ? "path-stop--completed" : unlocked ? "path-stop--available" : "path-stop--locked"}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `path-node ${done ? "path-node--completed" : unlocked ? "path-node--available" : "path-node--locked"}${stage.isBoss ? " path-node--boss" : ""}`;
    button.disabled = !unlocked;
    button.title = unlocked ? `Zagraj: ${stage.isBoss ? "Boss" : `Poziom ${stage.id}`}` : "Najpierw ukończ poprzednie poziomy";
    button.setAttribute("aria-label", button.title);
    button.innerHTML = `<span class="path-node__symbol" aria-hidden="true">${!unlocked ? "♙" : stage.isBoss ? "♛" : done ? "★" : stage.id}</span>`;
    button.addEventListener("click", () => startStage(stage));
    const label = document.createElement("span");
    label.className = "path-stop__title";
    label.textContent = stage.isBoss ? "BOSS" : `Poziom ${stage.id}`;
    const subtitle = document.createElement("span");
    subtitle.className = "path-stop__subtitle";
    subtitle.textContent = done ? "Ukończony · zagraj ponownie" : !unlocked ? "Zablokowany" : `${stage.images.length} kart · rozpocznij`;
    item.append(button, label, subtitle);
    stops.append(item);
  });
  save();
}

function clearRunTimers() {
  if (feedbackTimeout !== null) window.clearTimeout(feedbackTimeout);
  feedbackTimeout = null;
  pendingAnswer = false;
  card.style.transform = "";
  card.classList.remove("is-dragging");
  $("#swipe-human").style.opacity = "0";
  $("#swipe-ai").style.opacity = "0";
  answerButtons.forEach((button) => { button.disabled = false; });
}

function startStage(stage) {
  progress = regenerate(progress);
  if (!isStageUnlocked(progress, stage.id)) return;
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
  const current = run.deck[run.index];
  $("#play-counter").textContent = `${run.index + 1} / ${run.deck.length}`;
  $("#play-progress-bar").style.width = `${100 * run.index / run.deck.length}%`;
  feedback.textContent = "Wybierz odpowiedź albo przesuń kartę.";
  feedback.className = "play-feedback";
  image.alt = `Oznaczona grafika demonstracyjna ${current.id}`;
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
  progress = completeStage(progress, stage.id);
  save();
  const nextStage = STAGES[stage.id] || null;
  showResult(stage.isBoss ? "Boss pokonany!" : `Poziom ${stage.id} ukończony!`,
    stage.isBoss ? "Świetnie! Ukończono demonstracyjną kampanię. Możesz powtarzać etapy na mapie." : `Zaliczone ${stage.images.length} kart. ${nextStage ? `Odblokowano ${nextStage.isBoss ? "bossa" : `poziom ${nextStage.id}`}.` : ""}`,
    stage.isBoss ? "♛" : "★", nextStage);
}

function loseRun(message, deductHeart) {
  if (!run) return;
  if (deductHeart) progress = takeHeart(progress);
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
  const correct = run.deck[run.index].type === type;
  if (correct) {
    feedback.textContent = "Dobrze! Następna karta.";
    feedback.className = "play-feedback is-success";
    const referenceRun = run;
    feedbackTimeout = window.setTimeout(() => {
      if (run !== referenceRun || screen !== "play") return;
      run.index += 1;
      if (run.index >= run.deck.length) winRun(); else showCard();
    }, 330);
  } else {
    // No second chance within the same attempt: lose one heart, then discard the run.
    loseRun("Błędna odpowiedź — tracisz jedno serce i kończysz to podejście.", true);
  }
}

$("#answer-human").addEventListener("click", () => answer("human"));
$("#answer-ai").addEventListener("click", () => answer("ai"));
$("#back-to-map").addEventListener("click", () => { clearRunTimers(); run = null; setScreen("map"); });
$("#result-map").addEventListener("click", () => setScreen("map"));
$("#reset-demo").addEventListener("click", () => {
  if (!window.confirm("Czy na pewno wyzerować lokalny postęp kampanii i przywrócić 3 serca? (Tylko demonstracja)")) return;
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
window.setInterval(syncTime, 250);
window.addEventListener("pageshow", syncTime);
