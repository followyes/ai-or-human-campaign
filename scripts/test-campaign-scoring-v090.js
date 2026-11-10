import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { currentMultiplier,pointsForCorrect,createScoreRun,addCorrectScore,startingMultiplier } from '../js/campaign-scoring.js';
assert.equal(startingMultiplier(1),3);
assert.equal(startingMultiplier(2),2);
assert.equal(startingMultiplier(3),1);
assert.equal(startingMultiplier(80),1);
assert.equal(pointsForCorrect(1,2000),70);
assert.equal(pointsForCorrect(1,5000),63);
assert.equal(pointsForCorrect(1,10000),50);
assert.equal(pointsForCorrect(1,20000),25);
assert.equal(pointsForCorrect(2,5000),38);
assert.equal(pointsForCorrect(3,0),25);
assert.equal(pointsForCorrect(3,50000),25);
assert.equal(currentMultiplier(1,0),3);
assert.equal(currentMultiplier(1,1e7),1);
const score=addCorrectScore(addCorrectScore(createScoreRun(1),2000),5000);
assert.equal(score.points,133);
assert.equal(score.answerMs,7000);
assert.equal(score.correctAnswers,2);
const html=readFileSync(new URL('../campaign.html',import.meta.url),'utf8');
const map=readFileSync(new URL('../js/campaign-map.js',import.meta.url),'utf8');
for (const id of ['account-dialog','account-open','score-multiplier','score-total','score-toast']) {
  assert.match(html,new RegExp(`id="${id}"`));
}
assert.match(map,/await account\.begin\(/);
assert.match(map,/await account\.finish\(/);
assert.match(map,/pointsForCorrect|addCorrectScore/);
console.log('PASS v0.9.0 score tiers, decay, account UI, provisional backend contracts');
