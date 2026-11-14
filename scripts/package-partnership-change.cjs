const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=process.cwd(),output=path.join(root,'artifacts/sound-sync-partnership');
const files=[
 'app/api/cron/referral-reconciliation/route.ts','app/api/referrals/calculator/route.ts','app/api/referrals/me/route.ts',
 'components/income-sources.tsx','components/referral-commission-panel.tsx','components/referral-earnings-studio.tsx','components/partnership-activation.tsx',
 'instrumentation.ts','lib/email/send-transactional-email.ts','lib/income-summary.ts','lib/referral-calculator.ts','lib/referral-commissions.ts','lib/routes.ts',
 'lib/partnership-agreement.ts','lib/partnership-mail.ts','lib/partnership-pdf.ts','lib/partnerships.ts',
 'package.json','package-lock.json','prisma/schema.prisma','prisma/migrations/20261114120000_partnership_activation/migration.sql',
 'public/fonts/manrope-regular.ttf','public/fonts/manrope-bold.ttf',
 'app/(public)/partnerships/activate/[token]/page.tsx','app/(public)/partnerships/activate/[token]/partnership.module.css',
 'app/api/partnerships/[token]/activate/route.ts','app/api/partnerships/[token]/agreement/route.ts','app/api/admin/partnerships/sound-sync/route.ts',
 'docs/sound-sync-partnership.md','scripts/sound-sync-partnership.ts','scripts/verify-partnership.ts','scripts/verify-partnership-isolated.ts',
 'scripts/partnership-fixture-server.cjs','scripts/preview-partnership-email.cjs','scripts/package-partnership-change.cjs'
];
fs.mkdirSync(output,{recursive:true});
let patch=Buffer.alloc(0);
for(const file of files){
 if(!fs.existsSync(path.join(root,file)))throw Error(`Missing release source: ${file}`);
 const tracked=spawnSync('git',['ls-files','--error-unmatch','--',file],{encoding:'utf8',windowsHide:true}).status===0;
 const diff=spawnSync('git',tracked?['diff','--binary','HEAD','--',file]:['diff','--no-index','--binary','--','/dev/null',file],{maxBuffer:10*1024*1024,windowsHide:true});
 if(![0,1].includes(diff.status))throw Error(`Could not package ${file}`);
 patch=Buffer.concat([patch,diff.stdout]);
}
fs.writeFileSync(path.join(output,'partnership-changes.patch'),patch);
fs.writeFileSync(path.join(output,'source-manifest.json'),JSON.stringify({baseCommit:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).stdout.trim(),files,notes:'Review patch before applying. Existing HYMN logo and font licence are reused. Generated build files, credentials and unrelated workspace edits are excluded.'},null,2));
console.log(`Prepared ${files.length} source files in partnership-changes.patch (${patch.length} bytes).`);
