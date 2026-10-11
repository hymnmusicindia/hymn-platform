import assert from "node:assert/strict";
import { adminNavigation, adminModuleAllowed } from "../lib/admin-workspace-navigation";
import { consistentWorkspaceNavigation } from "../lib/workspace-navigation";

async function main() {
  const readOnly = adminNavigation(["users.read"]);
  assert(readOnly.some(item=>item.key==="users"));
  for(const key of ["payments","team","newsletter","promotions","distribution-queue","audit-admin"]) assert(!readOnly.some(item=>item.key===key),`${key} should require its permission`);
  assert(adminModuleAllowed("payments",["royalties.reconcile"]));
  assert(!adminModuleAllowed("users",[]));
  const producer=[{key:"catalog",label:"My beats",group:"Beatstore"},{key:"upload",label:"Upload beat",group:"Beatstore"}];
  assert.deepEqual(consistentWorkspaceNavigation(producer),producer,"Producer upload must not become artist release upload");
  // Force the local adapter. This regression test never connects to a database.
  process.env.DATABASE_URL="";
  const {createAdminTaskOnce,listAdminTasks,updateAdminTask}=await import("../lib/task-queue");
  const input={type:"test",title:"Task",body:"Regression test",href:"/admin",entityType:"test",entityId:1};
  const normal=await createAdminTaskOnce({...input,eventKey:"workspace-test-normal",priority:"normal"});
  const critical=await createAdminTaskOnce({...input,eventKey:"workspace-test-critical",priority:"critical"});
  const high=await createAdminTaskOnce({...input,eventKey:"workspace-test-high",priority:"high"});
  assert.deepEqual((await listAdminTasks()).map(row=>row.id),[critical.id,high.id,normal.id],"Critical work must precede alphabetic priority names");
  assert.equal((await createAdminTaskOnce({...input,eventKey:"workspace-test-critical",priority:"critical"})).id,critical.id);
  await updateAdminTask(critical.id,{status:"resolved"});
  await updateAdminTask(high.id,{status:"snoozed",snoozedUntil:new Date(Date.now()+60_000),assignedTo:7});
  assert.deepEqual((await listAdminTasks()).map(row=>row.id),[normal.id]);
  assert.equal((await listAdminTasks({status:"snoozed"}))[0].assignedTo,7);
  await updateAdminTask(high.id,{snoozedUntil:new Date(Date.now()-60_000)});
  assert.deepEqual((await listAdminTasks()).map(row=>row.id),[high.id,normal.id]);
  console.log("PASS: role-specific navigation, producer upload isolation, critical priority, idempotency, resolution, snooze and assignment.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
