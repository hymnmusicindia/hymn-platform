const { build } = require('esbuild');
const { chromium, expect } = require('@playwright/test');

async function main() {
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {CustomerCalls} from './components/team/customer-calls';
      const task={id:'call-1',version:1,status:'TODO',title:'Friendly introduction',dueAt:'2027-01-11T05:00:00Z',priority:'NORMAL',ownerId:'kira',followUpContext:{footnotes:['Ask about distribution']},client:{id:'client-1',name:'Artist One',phone:'+919876543210',email:'artist@example.com',status:'ACTIVE'}};
      window.calls=[]; window.rejectSave=false;
      const api=async(resource,body)=>{if(body){window.calls.push({resource,body});if(window.rejectSave)throw Error('Could not save. Try again.');task.version++;if(body.notes)task.followUpContext.footnotes.push(body.notes);if(body.nextAt)task.dueAt=body.nextAt;return {...task,followupEmail:body.outcome==='TALKED'?{status:'QUEUED'}:null};}return {items:[task],total:1}};
      createRoot(document.getElementById('root')).render(<CustomerCalls api={api} workspaceId="workspace-1"/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    plugins: [{ name: 'test-adapters', setup(b) {
      b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'test'}));
      b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:"import React from 'react'; export default function Link(p){return React.createElement('a',p)}",resolveDir:process.cwd()}));
      b.onLoad({filter:/\.module\.css$/},()=>({contents:'export default {}',loader:'js'}));
    } }],
  });
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844}});
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({content:bundle.outputFiles[0].text});
    await expect(page.getByRole('heading',{name:'Artist One'})).toBeVisible();
    await page.getByText('Add a footnote / reschedule',{exact:true}).click();
    await page.getByLabel('New footnote').fill('Prefers calls after lunch');
    await page.evaluate(()=>{window.rejectSave=true;});
    await page.getByRole('button',{name:'Save note / schedule'}).click();
    await expect(page.getByRole('alert')).toContainText('Could not save');
    await expect(page.getByLabel('New footnote')).toHaveValue('Prefers calls after lunch');
    await page.evaluate(()=>{window.rejectSave=false;});
    await page.getByRole('button',{name:'Save note / schedule'}).click();
    await expect(page.getByRole('status')).toHaveText('Note saved.');
    await expect(page.getByLabel('New footnote')).toHaveValue('');
    await page.getByLabel('Reschedule to').fill('2027-01-11T15:00');
    await page.getByRole('button',{name:'Save note / schedule'}).click();
    await expect(page.getByRole('status')).toHaveText('Note and schedule saved.');
    expect(await page.evaluate(()=>window.calls.at(-1).body.nextAt)).toBe('2027-01-11T09:30:00.000Z');
    await expect(page.getByRole('link',{name:'Edit contact details'})).toHaveAttribute('href',/module=contacts&client=client-1/);
    await page.getByLabel('Find a callback').fill('no match');
    await expect(page.getByRole('heading',{name:'Artist One'})).toHaveCount(0);
    await page.getByLabel('Find a callback').fill('');
    await page.getByRole('button',{name:'? Talked with client'}).click();
    await expect(page.getByRole('status').filter({hasText:'Marked as talked.'})).toContainText('Follow-up email queued');
    expect(await page.evaluate(()=>window.calls.at(-1).body.outcome)).toBe('TALKED');
    console.log('PASS call rep browser interactions: mobile queue, note persistence on failure, successful saves, IST rescheduling, contact edit link, search and one-click talked confirmation.');
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
