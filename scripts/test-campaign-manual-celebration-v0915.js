import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const js = readFileSync(new URL('../js/campaign-map.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../campaign.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/campaign.css', import.meta.url), 'utf8');
const win = js.slice(js.indexOf('async function winRun() {'), js.indexOf('\nasync function loseRun('));
const unlock = js.slice(js.indexOf('function prepareUnlockOnMap('), js.indexOf('\n// Quickly recenter the long map'));

assert.match(html, /id="celebration-return-map"[^>]*>← Powrót do mapy<\/button>/);
assert.match(html, /id="level-celebration"[^>]*role="dialog"[^>]*aria-modal="true"/);
assert.match(css, /\.celebration-return-map:focus-visible/);
assert.match(win, /const startUnlockAfterReturn = prepareUnlockOnMap\(stage, nextStage, wasCompleted\)/);
assert.match(win, /showCompletionCelebration\(stage, finishedRun\.score, startUnlockAfterReturn\)/);
assert.doesNotMatch(js, /CELEBRATION_SHOW_MS|CELEBRATION_DURATION_MS|celebrationHideTimer/);
assert.match(unlock, /return startUnlock;/);
assert.match(unlock, /if \(alreadyStarted \|\| screen !== 'map'/);

// Execute the actual modal logic in isolation, with fake DOM and clock.
function fakeClassList() {
  const classes = new Set();
  return { add: (...items) => items.forEach(v => classes.add(v)), remove: (...items) => items.forEach(v => classes.delete(v)), has: item => classes.has(item) };
}
function el() { return {hidden: true, disabled:false, textContent:'',classList:fakeClassList(),style:{setProperty(){}},replaceChildren(){},append(){},focus(){this.focused=true},addEventListener(name,fn){this[name]=fn}}; }
const elements = Object.fromEntries(['level-celebration','celebration-confetti','celebration-title','celebration-subtitle','celebration-points','celebration-return-map','score-toast'].map(k => [k,el()]));
let nextTimerId=1; const timers=new Map();
let unlocked=0;
const context={
  $: selector=>elements[selector.slice(1)],
  window:{setTimeout:(fn,ms)=>{const id=nextTimerId++;timers.set(id,{fn,ms});return id;},matchMedia:()=>({matches:false})},
  document:{createElement:()=>el()},
  requestAnimationFrame:fn=>fn(),
  clearTimeout:id=>timers.delete(id),
  secondsLabel:()=> '4,2 s',pointsLabel:()=> '365 pkt',
  CELEBRATION_FADE_MS:420,
  toastTimeout: undefined,
  screen:"map", mapScroller:el()
};
const block=js.slice(js.indexOf('let celebrationEndTimer = null;'),js.indexOf('\nfunction showScoreToast('));
vm.runInNewContext(block,context);
vm.runInNewContext("showCompletionCelebration({id:5,isBoss:false},{attemptNumber:1,answerMs:4200,points:365},onUnlock);",{...context,onUnlock:()=>unlocked++});
assert.equal(elements['level-celebration'].hidden,false);
assert.equal(elements['celebration-return-map'].focused,true);
assert.equal(timers.size,0,'no timer should auto-dismiss the congratulation popup');
assert.equal(unlocked,0);
const button=elements['celebration-return-map'];
button.click();
button.click(); // double-click is ignored
assert.equal(unlocked,0,'animation must not start before close');
assert.equal(timers.size,1,'a single fade timer is permitted after the click');
for(const item of [...timers.values()])item.fn();
assert.equal(elements['level-celebration'].hidden,true);
assert.equal(unlocked,1,'unlock triggers once after the panel closes');
assert.equal(timers.size,1);
console.log('PASS: confirmation modal stays open, click-to-return triggers unlock once after close');
