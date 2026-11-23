import assert from 'node:assert/strict';
import { preparationRetry } from '../lib/distribution-preparation-retry';
const now=Date.UTC(2026,10,23);
for(const failures of [0,4,5,50]){
  const result=preparationRetry(Object.assign(new Error('Provider Retry-After'),{code:'DIRENOTE_RATE_LIMIT',retryAfterSeconds:2400}),failures,now);
  assert.equal(result.failures,failures);
  assert.equal(result.nextAttemptAt,new Date(now+2400000).toISOString());
  assert.equal(result.deferredReason,'provider_capacity');
}
assert.equal(preparationRetry(new Error('Artist mapping verification timed out'),3,now).nextAttemptAt,new Date(now+480000).toISOString());
assert.equal(preparationRetry(new Error('Artist mapping verification timed out'),4,now).nextAttemptAt,undefined);
for(const reason of ['Artist identity differs','An unconfirmed update timed out','Invalid mapping; service unavailable','Reconciliation connection failed']) assert.equal(preparationRetry(new Error(reason),0,now).nextAttemptAt,undefined);
console.log('PASS capacity waits preserve approval and Retry-After beyond five deferrals; transient errors remain bounded; identity conflicts and uncertain writes stay held.');
