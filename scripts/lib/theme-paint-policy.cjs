// Interface surfaces inherit the theme. Illustrations and photo overlays retain artwork paints.
function isInterfacePaint(file, selector, property) {
  if (!['color', 'background', 'background-color'].includes(property)) return false;
  if (/theme-tokens\.css$|beat-store-hero\.css$|producer-link-page\.module\.css$/.test(file)) return false;
  // Record review is interface copy, not the decorative vinyl record illustration.
  if (/\.(?:release-|record-review|record-track|legal-|contributor-|track-|audio-waveform|first-release-(?:price|old-price|on-us))/.test(selector)) return true;
  // Record review is interface copy, not the decorative vinyl record illustration.
  if (/\.(?:release-|record-review|record-track|legal-|contributor-|track-|audio-waveform|first-release-(?:price|old-price|on-us))/.test(selector)) return true;
  if (/backdrop|scrim|::|:before|:after|hero|home-release|home-platform|record|vinyl|sleeve|groove|discLabel|disc\b|\.play\b|console|globe|platform|logo|avatar|image|swatch|sparkline|star|skeleton|shimmer|\.art\b/i.test(selector)) return false;
  return /dialog|modal|popup|panel|sheet|toolbar|menu|drawer|card|workspace|checkout|licen[cs]|feature|checklist|success-step|dashboard-os|^body$/i.test(selector);
}
function hasFixedColor(value) {
  // A fallback inside a canonical token is not an independently painted surface.
  let previous;
  do { previous = value;value = value.replace(/var\([^()]*\)/g, ''); } while (value !== previous);
  return /#[\da-f]{3,8}\b|rgba?\(|\b(?:white|black)\b/i.test(value);
}
module.exports = { isInterfacePaint, hasFixedColor };
