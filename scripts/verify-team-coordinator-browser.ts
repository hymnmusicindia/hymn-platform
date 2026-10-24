import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium, expect, type Page } from '@playwright/test';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { workWeek, moveWorkWeek } from '../lib/team/availability-rules';
async function main(){
  assert.equal(process.env.DATABASE_URL,'postgresql://fixture:fixture@127.0.0.1:55473/acquisition_fixture');
  const origin='http://127.0.0.1:35475',secret='coordinator-browser-fixture-secret-long-enough';
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--webpack','--port','35475','--hostname','127.0.0.1'],{env:{...process.env,NODE_ENV:'development',JWT_SECRET:secret,ADMIN_JWT_SECRET:secret,NEXT_DIST_DIR:'.next-coordinator-browser',NEXT_PUBLIC_APP_URL:origin,APP_URL:origin,CANONICAL_HOST:'127.0.0.1',EMAIL_ENABLED:'false'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let output='';server.stdout?.on('data',chunk=>{output=(output+chunk.toString()).slice(-8000);});server.stderr?.on('data',chunk=>{output=(output+chunk.toString()).slice(-8000);});
  const browser=await chromium.launch();
  let inspectedPage:Page|undefined;
  try{
    for(let i=0;i<120;i++){try{const r=await fetch(`${origin}/api/team/preferences`);if(r.status===401)break;}catch{}if(i===119)throw Error(`Test server did not start: ${output}`);await new Promise(r=>setTimeout(r,1000));}
    const operator=await prisma.teamMember.findFirstOrThrow({where:{user:{email:'Operator@coordinator.fixture.invalid'}},include:{user:true}});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    await context.addCookies([{name:'hymn_session',value:jwt.sign({sub:operator.userId,email:operator.user.email,name:operator.user.name,role:'customer'},secret,{expiresIn:'1h'}),url:origin}]);
    const page=await context.newPage();inspectedPage=page;page.setDefaultTimeout(120000);page.setDefaultNavigationTimeout(180000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${origin}/team?workspace=${operator.workspaceId}`);
    await page.getByRole('heading',{name:'Feed the context. Keep work moving.'}).waitFor();
    await page.getByLabel('What happened?',{exact:true}).fill('Prepare the verified customer onboarding guide for the team.');
    await expect.poll(async()=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)||'{}').details,`team-intake:${operator.id}`)).toBe('Prepare the verified customer onboarding guide for the team.');
    await page.reload();
    await expect(page.getByLabel('What happened?',{exact:true})).toHaveValue('Prepare the verified customer onboarding guide for the team.');
    await page.getByRole('button',{name:'Suggest fields from text',exact:true}).click();
    await page.getByLabel('Work category',{exact:true}).selectOption('GENERAL');
    await page.getByLabel('Short task title',{exact:true}).fill('Browser intake work');
    await page.getByLabel('Source / evidence',{exact:true}).fill('Browser operator handover');
    await page.getByRole('button',{name:'Save & assign automatically',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Saved in the waiting queue.'}).waitFor();
    await expect.poll(async()=>prisma.teamWorkIntake.count({where:{summary:'Browser intake work',status:'ASSIGNED'}}),{timeout:60000}).toBe(1);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Mobile intake must fit the viewport.');
    await page.screenshot({path:'.cache/team-coordinator-mobile.png',fullPage:true});
    const alice=await prisma.teamMember.findFirstOrThrow({where:{user:{email:'Alice@coordinator.fixture.invalid'}},include:{user:true}});
    await context.clearCookies();await context.addCookies([{name:'hymn_session',value:jwt.sign({sub:alice.userId,email:alice.user.email,name:alice.user.name,role:'customer'},secret,{expiresIn:'1h'}),url:origin}]);
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(`${origin}/team?workspace=${alice.workspaceId}&module=availability`);
    await page.getByRole('heading',{name:'Your week, clearly planned'}).waitFor();
    await page.getByRole('button',{name:'Next week',exact:true}).click();
    await expect(page.getByText(`Week of ${moveWorkWeek(workWeek(),1)}`,{exact:true})).toBeVisible();
    await page.getByRole('heading',{name:'40.00 hours declared',exact:true}).waitFor();
    await page.getByRole('button',{name:'Submit weekly availability',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Weekly availability submitted.'}).waitFor();
    const event=await prisma.teamCalendarEvent.findFirstOrThrow({where:{workspaceId:alice.workspaceId,title:'Confirmed customer appointment'}});
    await page.goto(`${origin}/team?workspace=${alice.workspaceId}&module=calendar&event=${event.id}&date=${new Date(event.startsAt.getTime()+330*60000).toISOString().slice(0,10)}`);
    await page.locator('dialog[open]').waitFor();
    await page.getByRole('button',{name:'Pass to next available rep',exact:true}).waitFor();
    await expect(page.getByLabel('Handoff representative')).toHaveValue('');
    assert.deepEqual(errors,[]);
    await page.screenshot({path:'.cache/team-coordinator-calendar.png',fullPage:true});
    console.log('PASS browser: operator paste-to-task persists, mobile intake fits, employee weekly plan submits, and assignment email deep links open the automatic handoff control without browser errors.');
  }catch(error){if(inspectedPage){await inspectedPage.screenshot({path:'.cache/team-coordinator-browser-failure.png',fullPage:true}).catch(()=>{});console.error((await inspectedPage.locator('body').innerText().catch(()=>'' )).slice(-3500));}console.error(output.slice(-2500));throw error;}finally{
    await browser.close();
    if(process.platform==='win32'&&server.pid)await new Promise<void>(resolve=>{const stop=spawn('taskkill',['/PID',String(server.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});stop.on('exit',()=>resolve());});else server.kill();
    await prisma.$disconnect();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
