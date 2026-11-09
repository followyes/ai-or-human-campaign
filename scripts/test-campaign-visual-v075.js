import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const js = readFileSync(new URL('../js/campaign-map.js', import.meta.url),'utf8');
const css = readFileSync(new URL('../css/campaign.css', import.meta.url),'utf8');
const html = readFileSync(new URL('../campaign.html', import.meta.url),'utf8');
assert.match(js, /plateNote\.textContent = done \? 'UKOŃCZONY · ZAGRAJ PONOWNIE'/);
assert.match(js, /completedMark\.textContent = '✓'/);
assert.match(js, /ensureUnlockMarkerVisible\(uid\)/);
assert.match(js, /plateNote\.textContent = 'ODBLOKOWANY · GRAJ'/);
assert.match(css, /@keyframes v072-unlock-number[^}]*rotate\(-45deg\)/);
assert.match(css, /@keyframes v075-visible-unlock/);
assert.match(css, /\.path-node__plate--completed/);
assert.match(css, /\.journey \.path-stop__title, \.journey \.path-stop__subtitle \{ display: none; \}/);
assert.match(html,/v=0\.8\.0/);
assert.ok(js.includes("plateTitle.textContent = stageName.toUpperCase()")); // Challenge Level is an intentional new label.
console.log('PASS v0.7.5 completed marker, level plate text, visible shake, upright numbers, versioned assets');
