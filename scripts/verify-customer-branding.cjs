const assert = require('node:assert/strict');
const { build } = require('esbuild');
const vm = require('node:vm');

(async () => {
  const result = await build({
    stdin: { contents: `export { customerBrandText, customerMessage } from './lib/customer-message'; export { releaseStatusEmail } from './lib/email/templates/release-status-email'; export { customerQcReport } from './lib/customer-qc-report'; export { policyDocuments, DISTRIBUTION_POLICY_SUMMARY } from './lib/policy-content';`, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'cjs', write: false,
    plugins: [{ name: 'server-only-test', setup(b) { b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'test' })); b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: '' })); } }]
  });
  const testModule = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module: testModule, exports: testModule.exports, require, process, URL, console });
  const { customerBrandText, customerMessage, releaseStatusEmail, customerQcReport, policyDocuments, DISTRIBUTION_POLICY_SUMMARY } = testModule.exports;
  const raw = 'DireNote review: DNM requires a licence. https://dashboard.direnotemedia.com/release_detection_analysis.php?upc=123';
  assert.equal(customerBrandText(raw), 'HYMN review: HYMN requires a licence. https://hymnmusic.fun/contact');
  assert.match(raw, /DireNote/); // Original evidence must remain untouched.
  assert.equal(customerBrandText('https://open.spotify.com/track/123'), 'https://open.spotify.com/track/123');
  assert.equal(customerMessage('DireNote requires WAV audio.'), 'HYMN requires WAV audio.');
  for (const event of ['release_changes_requested', 'release_rejected', 'release_scheduled', 'release_sent_to_distributor']) {
    const email = releaseStatusEmail(event, { userName: 'Artist', releaseTitle: 'Release', releaseId: 1, releaseStatus: 'changes_requested', manageReleaseUrl: 'https://hymnmusic.fun/dashboard/releases/1', rejectionReason: raw, providerApproved: true, qcSummary: raw, qcReportUrl: 'https://hymnmusic.fun/dashboard/releases/1/qc-report' });
    assert.doesNotMatch(JSON.stringify(email), /direnote|\bDNM\b/i);
    assert.match(email.html, /HYMN/);
    assert.match(email.text, /HYMN/);
  }
  const evidence = { tracks: [{ isrcLookup: 'DireNote lookup', upcLookup: 'DNM lookup', aiPrediction: '', notes: [raw], matches: [{ rightsOwners: ['Warner Music Group'] }] }] };
  const displayed = customerQcReport(evidence);
  assert.doesNotMatch(JSON.stringify(displayed), /direnote|\bDNM\b/i);
  assert.match(evidence.tracks[0].notes[0], /DireNote/);
  assert.equal(displayed.tracks[0].matches[0].rightsOwners[0], 'Warner Music Group');
  assert.doesNotMatch(JSON.stringify(policyDocuments), /direnote/i);
  assert.match(DISTRIBUTION_POLICY_SUMMARY, /partner retains 30%/);
  assert.match(DISTRIBUTION_POLICY_SUMMARY, /HYMN charges no additional/);
  assert.match(DISTRIBUTION_POLICY_SUMMARY, /70%/);
  console.log('PASS customer branding: legacy messages, provider links, email HTML/text, unchanged source evidence and accurate partner fee disclosure');
})().catch(error => { console.error(error); process.exitCode = 1; });
