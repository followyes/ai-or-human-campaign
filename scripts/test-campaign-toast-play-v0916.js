import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const game = readFileSync(new URL('js/campaign-map.js', root), 'utf8');
const style = readFileSync(new URL('css/style.css', root), 'utf8');
const css = readFileSync(new URL('css/campaign.css', root), 'utf8');
for (const filename of ['index.html', 'classic.html']) {
  const page = readFileSync(new URL(filename, root), 'utf8');
  const match = page.match(/<a class="game-mode-card campaign-mode-entry"[\s\S]*?<\/a>/);
  assert.ok(match, `${filename}: campaign entry is present`);
  assert.match(match[0], /Przejdź do mapy gry/);
  assert.match(match[0], /<span class="campaign-play-icon" aria-hidden="true">▶<\/span>/);
  assert.doesNotMatch(match[0], /campaign-play-cta|>\s*Play\s*<|<button\b/i, 'no nested Play button or text');
  assert.match(page, /css\/style\.css\?v=0\.9\.1\.6/);
}
assert.match(style, /\.campaign-play-icon\s*\{/);
assert.match(css, /\.score-toast\{z-index:220/);
assert.match(game, /if \(!scoreToastPinned \|\| celebrationDismissing \|\| toastRef\.hidden\) return/);
assert.doesNotMatch(game, /\},4400\);/, 'score toast has no unconditional auto-hide');

function cls() {
  const list = new Set();
  return { add: (...xs) => xs.forEach(x=>list.add(x)), remove: (...xs) => xs.forEach(x=>list.delete(x)), contains: (x)=>list.has(x) };
}
function el() {
  return { hidden:true, disabled:false, textContent:'', classList: cls(), style:{setProperty(){}}, children:[],
    append(...children){this.children.push(...children)}, replaceChildren(){this.children=[]},
    focus(){this.focused=true}, addEventListener(k,cb){this[k]=cb} };
}
const ids = ['level-celebration', 'celebration-confetti', 'celebration-title','celebration-subtitle',
'celebration-points','celebration-return-map','score-toast'];
const elements = Object.fromEntries(ids.map(x=>[x,el()]));
let id = 1;
const timers = new Map();
let unlocks=0;
const context = vm.createContext({
  $: (selector) => elements[selector.slice(1)],
  document: {createElement:()=>el()},
  requestAnimationFrame: callback=>callback(),
  clearTimeout: id=>timers.delete(id),
  toastTimeout: undefined,
  window:{setTimeout:(fn,ms)=>{const next=id++;timers.set(next,{fn,ms});return next;},matchMedia:()=>({matches:false})},
  secondsLabel: ()=>'3.0 s', pointsLabel: n=>String(n)+' pkt', CELEBRATION_FADE_MS:420,
  screen:'map', mapScroller:el(), onUnlock:()=>unlocks++
});
const block = game.slice(game.indexOf('let celebrationEndTimer = null;'), game.indexOf('\nconst mapScroller ='));
vm.runInContext(block, context);
vm.runInContext(`showCompletionCelebration({id:1,isBoss:false},{attemptNumber:1,answerMs:3000,points:350},onUnlock);
  showScoreToast({attemptNumber:1,answerMs:3000,points:350},true);`, context);
assert.equal(elements['level-celebration'].hidden,false);
assert.equal(elements['score-toast'].hidden,false);
assert.equal(elements['score-toast'].classList.contains('is-visible'),true);
assert.equal(timers.size,0,'both overlays must remain visible indefinitely');
vm.runInContext(`showScoreToast({attemptNumber:1,answerMs:3000,points:350},true,{mine:{place:2,better_than:80},total:10})`,context);
assert.equal(timers.size,0, 'async leaderboard refresh must not start hide timer');
assert.match(elements['score-toast'].children[1].textContent, /Miejsce 2\/10/);
assert.equal(unlocks,0);
elements['celebration-return-map'].click();
elements['celebration-return-map'].click();
assert.equal(elements['score-toast'].classList.contains('is-visible'),false);
assert.equal(elements['level-celebration'].classList.contains('is-leaving'),true);
assert.equal(unlocks,0, 'animation must wait until congratulation screen closes');
assert.equal(timers.size,2, 'two synchronized fade-out timers');
for (const item of [...timers.values()]) item.fn();
assert.equal(elements['score-toast'].hidden,true);
assert.equal(elements['level-celebration'].hidden,true);
assert.equal(unlocks,1, 'unlock only once after Return to map');
console.log('PASS: both overlays remain visible until Return to map; one unlock; homepage bare triangle');
