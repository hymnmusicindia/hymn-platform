import assert from 'node:assert/strict';
import {advanceOperationProgress, operationTarget} from '../lib/operation-progress';
assert.equal(operationTarget(0),1);
assert.equal(operationTarget(2000),50);
assert.equal(operationTarget(8000),80);
let current=1, previous=1;
for(let elapsed=100;elapsed<=180000;elapsed+=100){
 const target=operationTarget(elapsed);current=advanceOperationProgress(current,target,100);
 assert(current>=previous && current<=99,'Pending operations must be monotonic and never claim completion.');previous=current;
 if(elapsed===2000)assert(current>=45&&current<=50,'The initial half should advance quickly.');
 if(elapsed===8000)assert(current>=75&&current<=80,'The middle phase should be moderate.');
}
assert(advanceOperationProgress(90,99,100)-90<advanceOperationProgress(60,80,100)-60,'Finalization must move more slowly than the middle phase.');
assert(advanceOperationProgress(60,80,100)-60<advanceOperationProgress(20,50,100)-20,'The middle phase must move more slowly than startup.');
assert.equal(advanceOperationProgress(80,10,100),80,'A retried byte counter must not make the displayed operation move backward.');
assert(advanceOperationProgress(1,99,60000)<50,'A background-tab timer jump must not instantly produce 99%.');
console.log('PASS operation progress: fast/moderate/slow phases, monotonic retry behavior, delayed-tab bounds and no unconfirmed 100%.');
