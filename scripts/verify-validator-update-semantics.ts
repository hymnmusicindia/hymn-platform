import assert from 'node:assert/strict';
import { artistProfileUpdateSchema } from '../lib/validation';
import { taskSchema, taskUpdateSchema } from '../lib/team/validation';
import { beatBuyerDetailsSchema } from '../lib/beat-buyer-details';

assert.deepEqual(artistProfileUpdateSchema.parse({ name: 'Updated Artist' }), { name: 'Updated Artist' });
assert.deepEqual(artistProfileUpdateSchema.parse({ hasLiveMusic: false, isProducer: false }), { hasLiveMusic: false, isProducer: false });
assert.deepEqual(taskUpdateSchema.parse({ version: 1 }), { version: 1 }, 'An empty patch must not reset priority, approvals, dependencies or checklist');
assert.deepEqual(taskUpdateSchema.parse({ version: 2, description: '', priority: 'LOW', approvalRequired: false, dependencyIds: [], checklist: [] }), { version: 2, description: '', priority: 'LOW', approvalRequired: false, dependencyIds: [], checklist: [] }, 'Explicit clearing remains supported');
const task = taskSchema.parse({ title: 'Fixture task', ownerId: 'fixture-member' });
assert.equal(task.description, ''); assert.equal(task.priority, 'NORMAL'); assert.equal(task.approvalRequired, false);
assert.deepEqual(task.dependencyIds, []); assert.deepEqual(task.checklist, []);
const details = { legalName: 'Fixture Artist', artistName: 'Stage Artist', phone: '+919999999999', acceptedTerms: false };
const result = beatBuyerDetailsSchema.safeParse(details);
assert(!result.success); assert.equal(result.error.issues[0].message, 'Confirm your details and accept the licence terms.');
assert(beatBuyerDetailsSchema.safeParse({ ...details, acceptedTerms: true }).success);
console.log('PASS patched validator: artist/task updates preserve omitted fields, explicit clearing works, creation defaults remain and licence consent stays mandatory.');
