const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const file = path.join(__dirname, '../dist/cost-bom-tool.html');
let html = fs.readFileSync(file, 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1, 'Expected exactly one inline application script');
new vm.Script(scripts[0][1], {filename: 'cost-bom-tool.html'});
const hash = crypto.createHash('sha256').update(scripts[0][1]).digest('base64');
const policy = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
assert.ok(policy, 'CSP is required');
assert.ok(/script-src 'sha256-[^']+'/.test(policy[1]), 'Expected a hash-based script policy');
if (process.argv.includes('--update-csp')) {
  html = html.replace(policy[0], policy[0].replace(/script-src 'sha256-[^']+'/, `script-src 'sha256-${hash}'`));
  fs.writeFileSync(file, html);
}
assert.ok(html.includes(`script-src 'sha256-${hash}'`), 'CSP hash must match delivered JavaScript');
assert.ok(policy[1].includes("connect-src 'none'"));
assert.ok(policy[1].includes("form-action 'none'"));
assert.ok(!/<script[^>]+src\s*=/i.test(html), 'External script references are forbidden');
assert.ok(!/<(?:link|img|iframe)[^>]+(?:href|src)\s*=\s*["'](?:https?:)?\/\//i.test(html), 'Remote assets are forbidden');
assert.ok(!/@import\s|url\(\s*["']?(?:https?:)?\/\//i.test(html), 'Remote CSS assets are forbidden');
if (!process.argv.includes('--update-csp')) {
  assert.ok(fs.readFileSync(path.join(__dirname, '../dist/index.html')).equals(fs.readFileSync(file)), 'Deployment homepage must match the offline application; run npm run build');
}
console.log('Standalone checks passed: syntax, inline script, matching CSP hash and no external asset references.');
