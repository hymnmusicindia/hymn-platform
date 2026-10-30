const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const postcss = require('postcss');
const ts = require('typescript');
const { isInterfacePaint, hasFixedColor } = require('./lib/theme-paint-policy.cjs');

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
  for (const foreground of ['text', 'text-muted', 'text-soft']) for (const background of ['bg', 'bg-elevated', 'bg-soft', 'card', 'card-strong', 'surface', 'input', 'hover']) {
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
    if (/^--editor-(?:line|muted|surface)$/.test(declaration.prop)) assert.ok(!hasFixedColor(declaration.value), `${file}: editor palette must inherit theme tokens`);
    if (declaration.parent.selector && isInterfacePaint(file.replaceAll('\\', '/'), declaration.parent.selector, declaration.prop)) {
      assert.ok(!hasFixedColor(declaration.value), `${file}: fixed interface paint ${declaration.parent.selector}: ${declaration.toString()}`);
    }
  });
}
function components(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? components(path.join(directory, entry.name)) : entry.name.endsWith('.tsx') ? [path.join(directory, entry.name)] : []);
}
// These paint photographs/hero artwork or Google's independently branded sign-in control.
const brandedArtwork = /(?:animated-hero-metrics|home-path-banners|google-auth-button)\.tsx$/;
for (const file of components('components')) {
  if (brandedArtwork.test(file)) continue;
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'className' && node.initializer && ts.isStringLiteral(node.initializer)) {
      const value = node.initializer.text;
      if (/\bfixed\b/.test(value) && /\binset-(?:0|x-0)\b/.test(value)) assert.ok(!/\bbg-black\/[\d.]+/.test(value), `${file}: fullscreen scrims must use the shared overlay token`);
    }
    if (ts.isPropertyAssignment(node) && ['color', 'background', 'backgroundColor'].includes(node.name.getText(source)) && ts.isStringLiteral(node.initializer) && hasFixedColor(node.initializer.text)) {
      let parent = node.parent;
      while (parent && !ts.isJsxAttribute(parent)) parent = parent.parent;
      assert.ok(!parent || parent.name.getText(source) !== 'style', `${file}:${source.getLineAndCharacterOfPosition(node.pos).line + 1} fixed inline interface paint ${node.getText(source)}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
console.log('PASS light/dark text, semantic fills, primary actions, input boundaries, interface paints and inline-style theme contract');
