import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCampaignSounds } from '../js/campaign-sfx.js';
const js = readFileSync(new URL('../js/campaign-map.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../campaign.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/campaign.css', import.meta.url), 'utf8');
assert.match(html,/id="sound-toggle"[^>]*aria-pressed="true"/, 'accessible persistent sound control exists');
assert.match(js,/sounds\.play\(correct \? "success" : "failure"\)/, 'different sounds for different answers');
assert.match(js,/ANS(?:WER)?_EFFECT_MS = 980/, 'answer animation has a visible duration');
assert.match(js,/loseRun\("Błędna odpowiedź[^\n]+\n\s*}, ANSWER_EFFECT_MS\)/, 'loss appears after red animation');
assert.match(css,/\.swipe-area\.is-feedback-success::before/, 'green glow behind image');
assert.match(css,/\.swipe-area\.is-feedback-error::before/, 'red glow behind image');
assert.match(js,/unlockRevealTimeout = window\.setTimeout/, 'unlock reveal waits for map scroll');
assert.match(js,/classList\.add\('path-stop--unlock-animating'\)/, 'stage plays unlock animation');
assert.match(css,/@keyframes map-lock-shudder/, 'locked tile shakes before unlock');
assert.match(css,/@keyframes map-lock-reveal/, 'locked tile reveals available state');
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/, 'reduced-motion support');

const store = new Map();
let played = 0;
globalThis.window = {
  localStorage: { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,v) },
  AudioContext: class {
    currentTime = 0;
    state = 'running';
    destination = {};
    createOscillator(){ return { frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}}, connect(){}, start(){played++}, stop(){} }; }
    createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}; }
  }
};
const sounds=createCampaignSounds();
assert.equal(sounds.isEnabled(),true);
sounds.play('success'); assert.equal(played,2,'success has 2 generated notes');
sounds.play('failure'); assert.equal(played,4,'failure has 2 generated notes');
sounds.setEnabled(false); assert.equal(sounds.isEnabled(),false);
sounds.play('success'); assert.equal(played,4,'muted sounds never play');
sounds.setEnabled(true); assert.equal(sounds.isEnabled(),true);
console.log('PASS: unlock shake/reveal, delayed feedback glows, synthesized distinct sounds and mute');
