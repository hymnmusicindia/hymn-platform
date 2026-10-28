import assert from "node:assert/strict";
import { recoverTeamRead, teamDatabaseErrorCode } from "../lib/team/read-recovery";
import { assertTeamSchemaReady } from "../lib/team/schema-readiness";
import type { PrismaClient } from "@prisma/client";

async function main() {
  let attempts = 0;
  assert.equal(await recoverTeamRead(async () => {
    if (++attempts === 1) throw { errorCode: "P1001" };
    return "ready";
  }), "ready");
  assert.equal(attempts, 2);
  for (const code of ["P2022", "P2002", "UNKNOWN", "P2024"]) {
    attempts = 0;
    const error = { code, message: "private query details" };
    await assert.rejects(recoverTeamRead(async () => { attempts++; throw error; }), value => value === error);
    assert.equal(attempts, code === "P2024" ? 2 : 1, "Only transient reads retry, once.");
  }
  assert.equal(teamDatabaseErrorCode(new Error("postgresql://private")), "UNKNOWN");
  let columns = ["referral_history", "requires_referral_consent", "referral_accepted_at", "referral_ended_at", "referral_only"];
  const db = { $queryRaw: async () => columns.map(column_name => ({ column_name })) } as unknown as PrismaClient;
  await assertTeamSchemaReady(db);
  columns = columns.filter(column => column !== "referral_history");
  await assert.rejects(assertTeamSchemaReady(db), /Team Workspace migration required:.*referral_history/);
  console.log("PASS Team read recovery: bounded transient retry, permanent failure passthrough, safe diagnostic codes and deployment schema guard.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
