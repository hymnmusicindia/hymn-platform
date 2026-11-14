import EmbeddedPostgres from "embedded-postgres";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import path from "node:path";
const directory=mkdtempSync(path.resolve(".tmp/partnership-fixture-"));
const env:NodeJS.ProcessEnv={...process.env,DATABASE_URL:"postgresql://fixture:fixture@127.0.0.1:55479/partnership",EMAIL_ENABLED:"false",SMTP_USER:"",SMTP_APP_PASSWORD:"",RAZORPAY_KEY_ID:"",NEXT_PUBLIC_APP_URL:"http://127.0.0.1:35479",APP_URL:"http://127.0.0.1:35479",JWT_SECRET:"partnership-fixture-secret",ADMIN_JWT_SECRET:"partnership-fixture-admin-secret",NEXT_DIST_DIR:".next-partnership-fixture",HYMN_BUILD_DISABLE_CACHE:"true",NODE_ENV:"development"};
const run=(args:string[],executable=process.execPath)=>new Promise<void>((resolve,reject)=>{const child=spawn(executable,args,{env,stdio:"inherit",windowsHide:true});child.on("error",reject);child.on("exit",code=>code===0?resolve():reject(Error(`Fixture command failed (${code}).`)));});
async function main(){
 const pg=new EmbeddedPostgres({databaseDir:path.join(directory,"pg"),port:55479,user:"fixture",password:"fixture",persistent:true,initdbFlags:["--encoding=UTF8","--locale=C"],postgresFlags:["-h","127.0.0.1"]});
 await pg.initialise();await pg.start();try{await pg.createDatabase("partnership");await run(["node_modules/prisma/build/index.js","db","push","--skip-generate"]);await run(["--conditions=react-server","--import","tsx","scripts/verify-partnership.ts",...(process.argv.includes("--browser")?["--browser"]:[])]);}finally{if(process.platform==="win32")await run(["-D",path.join(directory,"pg"),"-m","fast","-w","stop"],path.resolve("node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe"));else await pg.stop();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
