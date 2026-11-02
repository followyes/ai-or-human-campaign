import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import {
  STAGES, MAX_HEARTS, HEART_REGEN_MS, newProgress, sanitizeProgress,
  regenerate, takeHeart, completeStage, isStageUnlocked, shuffleImages, formatTime
} from "../js/campaign-core.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
assert.deepEqual(STAGES.map((stage) => stage.images.length), [5,5,5,5,5,10]);
assert.deepEqual(STAGES.map((stage) => stage.isBoss), [false,false,false,false,false,true]);
assert.equal(new Set(STAGES.flatMap((stage) => stage.images.map((item) => item.id))).size, 35);
for (const stage of STAGES) {
  assert.equal(new Set(stage.images.map((item) => item.id)).size, stage.images.length);
  for (const photo of stage.images) {
    assert.ok(["ai", "human"].includes(photo.type));
    assert.ok(existsSync(resolve(root, photo.src)), `Missing demo image ${photo.src}`);
  }
  const deck = shuffleImages(stage.images, () => .13);
  assert.deepEqual(deck.map((photo) => photo.id).sort(), stage.images.map((photo) => photo.id).sort());
}
assert.equal(isStageUnlocked(newProgress(), 1), true);
assert.equal(isStageUnlocked(newProgress(), 2), false);
assert.equal(completeStage(newProgress(), 2).completed, 0);
let progress = newProgress();
progress = completeStage(progress, 1);
assert.equal(progress.completed, 1);
assert.equal(isStageUnlocked(progress, 2), true);
assert.equal(isStageUnlocked(progress, 3), false);
let t = 1_000_000;
progress = takeHeart(progress, t);
assert.equal(progress.hearts, 2);
assert.equal(progress.nextHeartAt, t + HEART_REGEN_MS);
progress = takeHeart(progress, t + 1000);
progress = takeHeart(progress, t + 2000);
assert.equal(progress.hearts, 0);
assert.equal(progress.completed, 1, "failure must not reset completed levels");
assert.equal(progress.nextHeartAt, t + HEART_REGEN_MS, "more damage must not restart regen clock");
progress = regenerate(progress, t + HEART_REGEN_MS - 1);
assert.equal(progress.hearts, 0);
progress = regenerate(progress, t + HEART_REGEN_MS);
assert.equal(progress.hearts, 1);
assert.equal(progress.nextHeartAt, t + HEART_REGEN_MS * 2);
progress = regenerate(progress, t + HEART_REGEN_MS * 4);
assert.equal(progress.hearts, MAX_HEARTS);
assert.equal(progress.nextHeartAt, null);
assert.deepEqual(sanitizeProgress({completed:99, hearts:-4, nextHeartAt:0}), {completed:6, hearts:0, nextHeartAt:null});
assert.equal(formatTime(600_000), "10:00");
assert.equal(formatTime(500), "00:01");
const html = readFileSync(resolve(root, "campaign.html"), "utf8");
const landing = readFileSync(resolve(root, "index.html"), "utf8");
assert.match(landing, /id="campaign-mode-link"/);
assert.match(html, /id="path-stops"/);
assert.match(html, /id="campaign-play-view"/);
assert.doesNotMatch(readFileSync(resolve(root, "js/campaign-map.js"), "utf8"), /fetch\(|supabase\.co|sb_secret_|service_role/);
console.log("PASS: Campaign demo data, unlocks, hearts, timer arithmetic and files");
