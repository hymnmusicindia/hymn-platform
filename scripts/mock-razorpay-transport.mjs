// Test-process preload only: the application keeps the real SDK and signature checks.
import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
assert.match(process.env.DATABASE_URL || '', /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55439\//);
assert.equal(process.env.RAZORPAY_KEY_ID, 'rzp_test_fixture');
const original = https.request;
https.request = function(options, ...args) {
  const parsed = typeof options === 'string' || options instanceof URL ? new URL(options) : options;
  if (parsed.hostname === 'api.razorpay.com' || parsed.host === 'api.razorpay.com') {
    return http.request({ ...parsed, protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1', port: 55442, agent: undefined }, ...args);
  }
  return original.call(this, options, ...args);
};
