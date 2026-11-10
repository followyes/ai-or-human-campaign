import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../admin/admin.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../admin/admin.js', import.meta.url), 'utf8');

assert.match(html, /id="admin-theme-toggle"/);
assert.match(html, /id="admin-theme-text"/);
assert.match(html, /aria-pressed="false"/);
assert.match(html, /class="admin-header-actions"/);
assert.match(html, /data-active-tab="library"/);
assert.match(html, /ai-or-human\.admin\.theme\.v0917/);
assert.match(html, /admin\.css\?v=0\.9\.1\.7/);
assert.match(html, /admin\.js\?v=0\.9\.1\.7/);
assert.match(js, /setAdminTheme\(document\.documentElement\.dataset\.adminTheme === "dark" \? "light" : "dark", \{ save: true \}\)/);
assert.match(js, /localStorage\.setItem\(ADMIN_THEME_KEY/);
assert.match(js, /adminCard\.dataset\.activeTab = tab/);
assert.match(js, /adminCard\.dataset\.activeTab = "library"/);
assert.match(css, /\.campaign-ranks-table-wrap\s*\{[^}]*max-height:\s*none;/s);
assert.match(css, /\.campaign-rank-results\s*\{[^}]*flex:\s*1 1 auto;/s);
assert.match(css, /\.admin-card\[data-view="authorized"\]\[data-active-tab="results"\]/);
assert.match(css, /:root\[data-admin-theme="dark"\]/);
console.log('Admin theme & full-height ranking contract: PASS');
