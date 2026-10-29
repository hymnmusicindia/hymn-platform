import assert from 'node:assert/strict';
import {retryAdminRead} from '../lib/admin-read-retry';
async function main(){
 let calls=0;
 assert.equal(await retryAdminRead(async()=>{if(++calls===1)throw {code:'P1001'};return 42;}),42);assert.equal(calls,2);
 calls=0;assert.equal(await retryAdminRead(async()=>{if(++calls===1)throw Object.assign(new Error("Can't reach database server"),{name:'PrismaClientInitializationError'});return 42;}),42);assert.equal(calls,2);
 calls=0;await assert.rejects(()=>retryAdminRead(async()=>{calls++;throw Object.assign(new Error('Pool unavailable'),{code:'P2024'});}),/Pool unavailable/);assert.equal(calls,2);
 for(const code of ['P2002','FORBIDDEN',undefined]){calls=0;await assert.rejects(()=>retryAdminRead(async()=>{calls++;throw Object.assign(new Error('Stop'),{code});}),/Stop/);assert.equal(calls,1);}
 console.log('PASS admin reads: one retry for temporary connectivity; no retries for permissions, data errors or unknown failures.');
}
main().catch(error=>{console.error(error);process.exitCode=1});
