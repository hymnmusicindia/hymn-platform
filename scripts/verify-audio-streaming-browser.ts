import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from '@playwright/test';
import { audioFileResponse } from '../lib/audio-file-response';

async function main() {
  const out = path.resolve('.cache/audio-stream-browser');await fs.mkdir(out, { recursive: true });
  const samples = 44100 * 30, bytes = Buffer.alloc(44 + samples * 2);
  bytes.write('RIFF');bytes.writeUInt32LE(bytes.length - 8, 4);bytes.write('WAVEfmt ', 8);bytes.writeUInt32LE(16, 16);bytes.writeUInt16LE(1, 20);bytes.writeUInt16LE(1, 22);bytes.writeUInt32LE(44100, 24);bytes.writeUInt32LE(88200, 28);bytes.writeUInt16LE(2, 32);bytes.writeUInt16LE(16, 34);bytes.write('data', 36);bytes.writeUInt32LE(samples * 2, 40);
  for (let n = 0; n < samples; n++) bytes.writeInt16LE(Math.round(Math.sin(n * 440 * 2 * Math.PI / 44100) * 1000), 44 + n * 2);
  const filename = path.join(out, 'preview.wav');await fs.writeFile(filename, bytes);
  await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{BeatPreviewPlayerProvider,useBeatPreviewPlayer}from'./components/beat-preview-player';function Test(){const p=useBeatPreviewPlayer();window.player=p;return <>{[1,2].map(id=><button key={id} onClick={()=>p.playBeat({id,title:'Stream '+id,producer:{name:'Producer',slug:'p'},previewUrl:'/audio/'+id+'.wav',price:120,availableLicenses:['mp3']})}>Play test {id}</button>)}</>}createRoot(document.getElementById('root')).render(<BeatPreviewPlayerProvider><Test/></BeatPreviewPlayerProvider>);`, loader: 'tsx', resolveDir: process.cwd() }, bundle: true, outfile: path.join(out, 'ui.js'), jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next', setup(b) {
    b.onResolve({ filter: /^next\// }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'import React from"react";export default function Link({children,...p}){return <a {...p}>{children}</a>}export const usePathname=()=>"/beat-store";export const useRouter=()=>({});', loader: 'tsx', resolveDir: process.cwd() }));
  } }] });
  const js = await fs.readFile(path.join(out, 'ui.js'));
  const transfers: Array<{url:string;sent:number;closed:boolean;range:string|undefined}> = [];
  const server = createServer(async (req, res) => {
    if (req.url === '/ui.js') { res.setHeader('Content-Type', 'text/javascript');res.end(js);return; }
    if (!req.url?.startsWith('/audio/')) { res.setHeader('Content-Type', 'text/html');res.end('<div id="root"></div><script src="/ui.js"></script>');return; }
    const controller = new AbortController();
    const transfer = { url: req.url, sent: 0, closed: false, range: req.headers.range };transfers.push(transfer);
    res.on('close', () => { transfer.closed = true;controller.abort(); });
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await audioFileResponse(new Request('http://localhost' + req.url, { headers: req.headers.range ? { Range: req.headers.range } : {}, signal: controller.signal }), await fs.open(filename, 'r'), { mimeType: 'audio/wav', cacheControl: 'private, no-cache' });
      res.writeHead(response.status, Object.fromEntries(response.headers));reader = response.body!.getReader();
      while (!res.destroyed) {
        const next = await reader.read();if (next.done) break;
        transfer.sent += next.value.length;res.write(next.value);
        // Slow delivery proves playback does not wait for the entire response.
        await new Promise(resolve => setTimeout(resolve, 35));
      }
      if (!res.destroyed) res.end();
    } catch { if (!res.destroyed) res.destroy(); }
    finally { await reader?.cancel().catch(() => undefined); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as {port:number};const origin = `http://127.0.0.1:${address.port}`;
  const browser = await chromium.launch();
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 500 });
      const beforeBrowse = transfers.length;await page.goto(origin);await page.waitForFunction(() => Boolean((window as any).player));
      assert.equal(transfers.length, beforeBrowse, 'Browsing must not preload every beat');
      const begin = Date.now(), firstIndex = transfers.length;
      await page.getByRole('button', { name: 'Play test 1', exact: true }).click();
      await page.waitForFunction(() => (window as any).player.playing && (window as any).player.activeBeatId === 1);
      const initialBytes = transfers.slice(firstIndex).reduce((sum, t) => sum + t.sent, 0);
      assert.ok(initialBytes < bytes.length, 'Real audio must start before the complete source is sent');
      assert.ok(transfers.slice(firstIndex).some(t => t.range), 'Native browser must use byte ranges');
      await page.getByRole('button', { name: 'Play test 2', exact: true }).click();
      await page.waitForFunction(() => (window as any).player.playing && (window as any).player.activeBeatId === 2 && !(window as any).player.error);
      await page.waitForFunction(() => (window as any).player.currentTime > 0);
      assert.ok(transfers.slice(firstIndex).filter(t => t.url === '/audio/1.wav').every(t => t.closed), 'Switching must close the previous transfer');
      console.log(`PASS ${width}px native playback started at ${initialBytes}/${bytes.length} bytes; first start + switch ${Date.now()-begin}ms; old stream cancelled`);
      await page.close();
    }
  } finally { await browser.close();server.closeAllConnections();await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(error => { console.error(error);process.exitCode = 1; });
