const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const postcss = require('postcss');

const tokenFile = 'app/styles/theme-tokens.css';
const root = postcss.parse(fs.readFileSync(tokenFile, 'utf8'));
const palettes = [];
root.walkRules(rule => {
  const palette = {};
  rule.walkDecls(/^--hymn-/, declaration => { palette[declaration.prop.slice(7)] = declaration.value; });
  if (Object.keys(palette).length) palettes.push(palette);
});
const rgb = color => { assert.match(color, /^#[0-9a-f]{6}$/i); return [1, 3, 5].map(index => parseInt(color.slice(index, index + 2), 16) / 255); };
const luminance = color => rgb(color).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
for (const palette of palettes) {
  for (const foreground of ['text', 'text-muted', 'text-soft']) for (const background of ['bg', 'card', 'surface', 'input']) {
    assert.ok(contrast(palette[foreground], palette[background]) >= 4.5, `${foreground} on ${background}: ${palette[foreground]} / ${palette[background]}`);
  }
  for (const semantic of ['success', 'danger', 'error', 'warning', 'info', 'money']) assert.ok(contrast(palette[semantic], palette[`${semantic}-soft`]) >= 4.5, semantic);
  assert.ok(contrast(palette['accent-foreground'], palette.accent) >= 4.5);
  assert.ok(contrast(palette['money-foreground'], palette.money) >= 4.5);
  assert.ok(contrast(palette['border-strong'], palette.input) >= 3, 'Input boundary contrast');
}
const names = new Set(Object.keys(palettes[0]));
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : entry.name.endsWith('.css') ? [path.join(directory, entry.name)] : []);
}
for (const file of ['app/globals.css', ...files('app/styles'), ...files('components')]) {
  if (file.replaceAll('\\', '/') === tokenFile) continue;
  postcss.parse(fs.readFileSync(file, 'utf8')).walkDecls(declaration => {
    if (names.has(declaration.prop.slice(2))) assert.ok(declaration.value.startsWith('var('), `${file}: local palette override ${declaration.toString()}`);
  });
}
console.log('PASS light/dark text, semantic fills, primary actions, input boundaries and single-source theme contract');
