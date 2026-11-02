// Local Campaign prototype. No Supabase calls or secrets in this module.
export const MAX_HEARTS = 3;
export const HEART_REGEN_MS = 10 * 60 * 1000;
export const BOSS_LIMIT_MS = 60 * 1000; // TEST VALUE: final boss time is not yet approved.
export const STORAGE_KEY = "ai-or-human.campaign.prototype.v02";

const PHOTO_GROUPS = [5, 5, 5, 5, 5, 10];
const NAMES = ["Pierwszy kontakt", "Trudniejszy wybór", "Oko detektywa", "Granice realizmu", "Ostatni test", "Finałowa próba"];
let imageIndex = 0;

export const STAGES = Object.freeze(PHOTO_GROUPS.map((count, index) => Object.freeze({
  id: index + 1,
  title: NAMES[index],
  isBoss: index === 5,
  images: Object.freeze(Array.from({ length: count }, (_, imagePosition) => {
    imageIndex += 1;
    const number = String(imageIndex).padStart(2, "0");
    // Demonstration labels are artificial. They are not asserted to be real photo origins.
    return Object.freeze({
      id: `demo-${number}`,
      type: (imageIndex * 7 + index) % 4 < 2 ? "ai" : "human",
      src: `./assets/campaign/demo/${number}.svg`,
      imagePosition
    });
  }))
})));

export function newProgress() {
  return { completed: 0, hearts: MAX_HEARTS, nextHeartAt: null };
}

export function sanitizeProgress(raw) {
  if (!raw || typeof raw !== "object") return newProgress();
  const completed = Number.isInteger(raw.completed) ? Math.max(0, Math.min(6, raw.completed)) : 0;
  const hearts = Number.isInteger(raw.hearts) ? Math.max(0, Math.min(MAX_HEARTS, raw.hearts)) : MAX_HEARTS;
  const nextHeartAt = hearts < MAX_HEARTS && Number.isFinite(raw.nextHeartAt) && raw.nextHeartAt > 0
    ? raw.nextHeartAt : null;
  return { completed, hearts, nextHeartAt };
}

export function regenerate(raw, now = Date.now()) {
  const current = sanitizeProgress(raw);
  if (current.hearts === MAX_HEARTS) return { ...current, nextHeartAt: null };
  let nextHeartAt = current.nextHeartAt;
  if (nextHeartAt === null) nextHeartAt = now + HEART_REGEN_MS;
  if (now < nextHeartAt) return { ...current, nextHeartAt };
  const gained = Math.min(MAX_HEARTS - current.hearts, 1 + Math.floor((now - nextHeartAt) / HEART_REGEN_MS));
  const hearts = current.hearts + gained;
  return {
    ...current,
    hearts,
    nextHeartAt: hearts === MAX_HEARTS ? null : nextHeartAt + gained * HEART_REGEN_MS
  };
}

export function takeHeart(raw, now = Date.now()) {
  const current = regenerate(raw, now);
  if (current.hearts === 0) return current;
  return {
    ...current,
    hearts: current.hearts - 1,
    nextHeartAt: current.hearts === MAX_HEARTS ? now + HEART_REGEN_MS : current.nextHeartAt
  };
}

export function completeStage(raw, stageId) {
  const current = sanitizeProgress(raw);
  if (!Number.isInteger(stageId) || stageId < 1 || stageId > 6 || stageId > current.completed + 1) {
    return current;
  }
  return { ...current, completed: Math.max(current.completed, stageId) };
}

export function isStageUnlocked(progress, stageId) {
  return Number.isInteger(stageId) && stageId >= 1 && stageId <= Math.min(6, sanitizeProgress(progress).completed + 1);
}

// Fisher–Yates. A fresh shuffle changes order, not membership.
export function shuffleImages(images, random = Math.random) {
  const shuffled = [...images];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.max(0, Math.min(i, Math.floor(random() * (i + 1))));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function formatTime(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
