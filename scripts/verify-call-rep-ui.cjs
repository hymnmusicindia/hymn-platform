const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

async function main() {
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CustomerCalls} from './components/team/customer-calls';
      const task={id:'call-1',version:1,status:'TODO',title:'Friendly introduction',dueAt:'2027-01-11T05:00:00Z',priority:'NORMAL',ownerId:'kira',followUpContext:{kind:'FRIENDLY_INTRO',tip:'A very long legacy script that should not fill the card.',footnotes:['Ask about distribution']},client:{id:'client-1',name:'Artist One',registered:true,coverUrl:'https://fixture.test/cover.svg',avatarUrl:'https://fixture.test/avatar.svg',phone:'+919876543210',email:'artist@example.com',status:'ACTIVE'}};
      const extra=[{...task,id:'call-2',client:{...task.client,id:'client-2',name:'Dynamic Music',registered:false,coverUrl:null,avatarUrl:null}},{...task,id:'call-3',priority:'HIGH',client:{...task.client,id:'client-3',name:'Takumi',coverUrl:null,avatarUrl:null}}];
      window.calls=[]; window.rejectSave=false;
      const api=async(resource,body)=>{if(body){window.calls.push({resource,body});if(window.rejectSave)throw Error('Could not save. Try again.');task.version++;if(body.notes)task.followUpContext.footnotes.push(body.notes);if(body.nextAt)task.dueAt=body.nextAt;return {...task,followupEmail:body.outcome==='TALKED'?{status:'QUEUED'}:null};}return {items:[task,...extra],total:3}};
      createRoot(document.getElementById('root')).render(<CustomerCalls api={api} workspaceId="workspace-1"/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, outdir:'out', format: 'iife', jsx: 'automatic',
    plugins: [{ name: 'test-adapters', setup(b) {
      b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'test'}));
      b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:"import React from 'react'; export default function Link(p){return React.createElement('a',p)}",resolveDir:process.cwd()}));

    } }],
  });
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.route('https://fixture.test/**', route => route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240"><defs><linearGradient id="g"><stop stop-color="#354b77"/><stop offset="1" stop-color="#407b70"/></linearGradient></defs><path fill="url(#g)" d="M0 0h800v240H0z"/><circle cx="630" cy="80" r="130" fill="#729a9a" opacity=".4"/></svg>'}));
    await page.setContent('<style>*{box-sizing:border-box}body{margin:0;background:#0e131c;font:14px Arial;padding:20px}button,input,textarea,select{font:inherit}h2,p{margin:0}svg{flex-shrink:0}</style><div id="root"></div>');
    for(const output of bundle.outputFiles) { if(output.path.endsWith('.css')) await page.addStyleTag({content:output.text}); else if(output.path.endsWith('.js')) await page.addScriptTag({content:output.text}); }
    const card=page.getByRole('article',{name:'Callback for Artist One'});
    await expect(card.getByText('HYMN account',{exact:true})).toBeVisible();
    await expect(card.locator('img')).toHaveCount(2);
    await card.getByRole('button',{name:'Collapse card for Artist One'}).click();
    await expect(card.getByRole('link',{name:'Call now'})).not.toBeVisible();
    await card.getByRole('button',{name:'Expand card for Artist One'}).click();
    await expect(card.getByRole('link',{name:'Call now'})).toBeVisible();
    await expect(card.getByText('A very long legacy script that should not fill the card.')).toHaveCount(0);
    await expect(card.locator('ul').first().locator('li')).toHaveCount(3);
    await expect(card.getByLabel('New footnote')).not.toBeVisible();
    await card.getByText('Call details & notes',{exact:true}).click();
    await expect(page.getByRole('heading',{name:'Artist One'})).toBeVisible();
    await card.getByText('Add a footnote / reschedule',{exact:true}).click();
    await card.getByLabel('New footnote').fill('Prefers calls after lunch');
    await page.evaluate(()=>{window.rejectSave=true;});
    await card.getByRole('button',{name:'Save note / schedule'}).click();
    await expect(page.getByRole('alert')).toContainText('Could not save');
    await expect(card.getByLabel('New footnote')).toHaveValue('Prefers calls after lunch');
    await page.evaluate(()=>{window.rejectSave=false;});
    await card.getByRole('button',{name:'Save note / schedule'}).click();
    await expect(card.getByRole('status')).toHaveText('Note saved.');
    await expect(card.getByLabel('New footnote')).toHaveValue('');
    await card.getByLabel('Reschedule to').fill('2027-01-11T15:00');
    await card.getByRole('button',{name:'Save note / schedule'}).click();
    await expect(card.getByRole('status')).toHaveText('Note and schedule saved.');
    expect(await page.evaluate(()=>window.calls.at(-1).body.nextAt)).toBe('2027-01-11T09:30:00.000Z');
    await expect(card.getByRole('link',{name:'Edit contact'})).toHaveAttribute('href',/module=contacts&client=client-1/);
    await page.getByLabel('Find a callback').fill('no match');
    await expect(page.getByRole('heading',{name:'Artist One'})).toHaveCount(0);
    await page.getByLabel('Find a callback').fill('');
    const before=await page.evaluate(()=>window.calls.length);
    await card.getByRole('button',{name:'Talked with client',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(()=>window.calls.length)).toBe(before);
    await page.getByRole('button',{name:'Go back',exact:true}).click();
    expect(await page.evaluate(()=>window.calls.length)).toBe(before);
    await card.getByRole('button',{name:'Talked with client',exact:true}).click();
    await page.getByRole('button',{name:'Yes, talked with client',exact:true}).click();
    await expect(page.getByRole('status').filter({hasText:'Marked as talked.'})).toContainText('Follow-up email queued');
    expect(await page.evaluate(()=>window.calls.at(-1).body.outcome)).toBe('TALKED');
    await card.getByText('Call details & notes',{exact:true}).click();
    await card.getByText('Record another outcome',{exact:true}).click();
    await card.getByLabel('Actual outcome').selectOption('TALKED');
    await card.getByLabel('Call notes',{exact:true}).fill('We discussed their release.');
    const beforeForm=await page.evaluate(()=>window.calls.length);
    await card.getByRole('button',{name:'Save outcome',exact:true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(()=>window.calls.length)).toBe(beforeForm);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(card.getByLabel('Call notes',{exact:true})).toHaveValue('We discussed their release.');
    await card.getByText('Call details & notes',{exact:true}).click();
    await expect(card.getByLabel('New footnote')).not.toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:'.tmp/call-cards-mobile.png',fullPage:true});
    await page.setViewportSize({width:1280,height:1000});
    await page.screenshot({path:'.tmp/call-cards-desktop.png',fullPage:true});
    console.log('PASS call rep browser interactions: mobile queue, note persistence on failure, successful saves, IST rescheduling, contact edit link, search and two-step talked confirmation, cancellation, collapsed details, account imagery and responsive layout.');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
