const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
(async () => {
  let session = { sub: 42 }, active = true, membership = true;
  class TeamError extends Error { constructor(message, status) { super(message); this.status = status; } }
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/team/access.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: module.exports, require(id) {
      if(id==='server-only')return {};
      if(id==='@/lib/session')return {getSession:async()=>session};
      if(id==='./policy')return {TeamError};
      if(id==='@/lib/prisma')return {prisma:{user:{findUnique:async()=>active?{id:42,status:'ACTIVE'}:null},teamMember:{findFirst:async query=>{
        assert.equal(query.where.userId,42);assert.equal(query.where.status,'ACTIVE');assert.equal(query.where.workspaceId,'workspace');
        // Simulate the preceding production schema: feature columns do not exist.
        if(query.include.workspace===true)throw Error('P2022: customer_followup_cursor missing');
        assert.deepEqual(JSON.parse(JSON.stringify(query.include.workspace)),{select:{id:true,name:true}});
        return membership?{id:'member',workspace:{id:'workspace',name:'HYMN'}}:null;
      }}}};
      throw Error('Unexpected import '+id);
    }
  });
  assert.equal((await module.exports.teamActor('workspace')).workspace.name,'HYMN');
  session=null;await assert.rejects(module.exports.teamActor('workspace'),error=>error.status===401);
  session={sub:42};active=false;await assert.rejects(module.exports.teamActor('workspace'),error=>error.status===403);
  active=true;membership=false;await assert.rejects(module.exports.teamActor('workspace'),error=>error.status===403);
  console.log('PASS Team OS startup: minimal workspace projection, schema compatibility, session, active account and membership boundaries.');
})().catch(error=>{console.error(error);process.exitCode=1;});
