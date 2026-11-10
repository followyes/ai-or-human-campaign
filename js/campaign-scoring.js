/** v0.9.0: pure, deterministic prototype scoring. Ranked scores require server grading. */
export const BASE_POINTS = 25;
export const MULTIPLIER_DECAY_PER_SECOND = 0.1;
export function startingMultiplier(attemptNumber) {
  if (!Number.isFinite(attemptNumber) || attemptNumber < 1) return 1;
  return attemptNumber === 1 ? 3 : attemptNumber === 2 ? 2 : 1;
}
export function currentMultiplier(attemptNumber, elapsedMilliseconds) {
  const seconds = Math.max(0, Number.isFinite(elapsedMilliseconds) ? elapsedMilliseconds / 1000 : 0);
  return Math.max(1, startingMultiplier(attemptNumber) - seconds * MULTIPLIER_DECAY_PER_SECOND);
}
/** Freeze the displayed multiplier during committed-answer feedback.
 * Ranked scoring stays authoritative on the Supabase server. */
export function displayMultiplier(attemptNumber, elapsedMilliseconds, lockedMultiplier = null) {
  return Number.isFinite(lockedMultiplier) ? lockedMultiplier : currentMultiplier(attemptNumber, elapsedMilliseconds);
}
export function pointsForCorrect(attemptNumber, elapsedMilliseconds) {
  return Math.round(BASE_POINTS * currentMultiplier(attemptNumber, elapsedMilliseconds));
}
export function pointsLabel(points) {
  return `${Math.max(0, Math.trunc(points || 0))} pkt`;
}
export function secondsLabel(milliseconds) {
  return `${(Math.max(0, milliseconds || 0) / 1000).toFixed(1).replace('.', ',')} s`;
}
/** Local preview is not a verified leaderboard submission. */
export function createScoreRun(attemptNumber, startedAt = Date.now()) {
  return { attemptNumber, startedAt, points: 0, answerMs: 0, correctAnswers: 0 };
}
export function addCorrectScore(scoreRun, elapsedMilliseconds) {
  const time = Math.max(0, Math.round(elapsedMilliseconds));
  const award = pointsForCorrect(scoreRun.attemptNumber, time);
  return { ...scoreRun, points: scoreRun.points + award, answerMs: scoreRun.answerMs + time, correctAnswers: scoreRun.correctAnswers + 1, lastAward: award };
}
