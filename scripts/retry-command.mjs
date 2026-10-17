import { spawn } from "node:child_process";

const command = process.argv[2];
const args = process.argv.slice(3);
const requestedRetries = Number(process.env.COMMAND_RETRIES ?? 2);
const retries = Number.isFinite(requestedRetries) ? Math.max(0, Math.min(requestedRetries, 5)) : 2;
if (!command || !args.length) {
  console.error("Usage: node scripts/retry-command.mjs <command> <args...>");
  process.exit(2);
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function runOnce() {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", windowsHide: true, env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

for (let attempt = 0; attempt <= retries; attempt++) {
  try {
    const result = await runOnce();
    if (result.code === 0) process.exit(0);
    if (attempt === retries) {
      console.error(`Command failed after ${attempt + 1} attempts (exit ${result.code}${result.signal ? `, signal ${result.signal}` : ""}).`);
      process.exit(result.code || 1);
    }
    console.error(`Command failed (exit ${result.code}); retrying in ${2 ** attempt} seconds (${attempt + 2}/${retries + 1}).`);
  } catch (error) {
    if (attempt === retries) {
      console.error(`Command could not start after ${attempt + 1} attempts: ${error instanceof Error ? error.message : "unknown spawn error"}`);
      process.exit(1);
    }
    console.error(`Command could not start; retrying in ${2 ** attempt} seconds (${attempt + 2}/${retries + 1}).`);
  }
  await wait(Math.min(30_000, 1000 * 2 ** attempt));
}
