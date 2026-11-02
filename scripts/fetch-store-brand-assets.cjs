// Downloads unmodified icons published by the stores themselves; never draws logos.
const fs = require('node:fs/promises');
const path = require('node:path');
const sites = {
  spotify:'https://open.spotify.com', apple:'https://music.apple.com', amazon:'https://music.amazon.com', youtube:'https://music.youtube.com',
  jiosaavn:'https://www.jiosaavn.com', gaana:'https://gaana.com', wynk:'https://wynk.in', hungama:'https://www.hungama.com',
  deezer:'https://www.deezer.com', tidal:'https://tidal.com', pandora:'https://www.pandora.com', soundcloud:'https://soundcloud.com',
  audiomack:'https://audiomack.com', anghami:'https://www.anghami.com', boomplay:'https://www.boomplay.com', napster:'https://www.napster.com',
  iheart:'https://www.iheart.com', facebook:'https://www.facebook.com', tiktok:'https://www.tiktok.com', snapchat:'https://www.snapchat.com',
  shazam:'https://www.shazam.com', qobuz:'https://www.qobuz.com', beatport:'https://www.beatport.com', traxsource:'https://www.traxsource.com',
  sevendigital:'https://www.7digital.com', tencent:'https://y.qq.com', netease:'https://music.163.com', yandex:'https://music.yandex.com',
  vk:'https://vk.com', kkbox:'https://www.kkbox.com', joox:'https://www.joox.com', line:'https://music.line.me',
  melon:'https://www.melon.com', genie:'https://www.genie.co.kr', flo:'https://www.music-flo.com', bugs:'https://music.bugs.co.kr'
};
async function get(url) {
  const r = await fetch(url, {signal:AbortSignal.timeout(12000),headers:{'User-Agent':'Mozilla/5.0'}});
  if(!r.ok) throw Error(`HTTP ${r.status}`);
  return r;
}
async function download(key, site) {
  const candidates=[];
  try {
    const page=await get(site), html=await page.text();
    for(const tag of html.match(/<link\b[^>]+>/gi)||[]) {
      const rel=tag.match(/\brel=["']([^"']+)/i)?.[1];
      const href=tag.match(/\bhref=["']([^"']+)/i)?.[1];
      if(rel && /^(apple-touch-icon|icon|shortcut icon)$/i.test(rel) && href) candidates.push(new URL(href.replace(/&amp;/g,'&'),page.url).href);
    }
  } catch {}
  candidates.push(new URL('/favicon.ico',site).href);
  for(const url of [...new Set(candidates)].reverse()) try {
    const r=await get(url), bytes=Buffer.from(await r.arrayBuffer());
    const type=r.headers.get('content-type')||'';
    const png=bytes.subarray(0,4).toString('hex')==='89504e47';
    const ico=bytes.subarray(0,4).toString('hex')==='00000100';
    const svg=type.includes('svg') && bytes.toString().includes('<svg');
    if(!png&&!ico&&!svg) continue;
    const file=`${key}.${png?'png':ico?'ico':'svg'}`;
    await fs.writeFile(path.join('public/assets/store-logos/original',file),bytes);
    return {key,file,source:r.url,website:site};
  } catch {}
  return {key,website:site,unavailable:true};
}
(async()=>{
  await fs.mkdir('public/assets/store-logos/original',{recursive:true});
  const entries=Object.entries(sites), results=[];
  for(let i=0;i<entries.length;i+=6) results.push(...await Promise.all(entries.slice(i,i+6).map(([k,v])=>download(k,v))));
  await fs.writeFile('public/assets/store-logos/original/sources.json',JSON.stringify({verifiedAt:'2026-11-03',assets:results},null,2)+'\n');
  console.log(JSON.stringify(results.map(({key,file,unavailable})=>({key,file,unavailable}))));
})().catch(e=>{console.error(e.message);process.exitCode=1});
