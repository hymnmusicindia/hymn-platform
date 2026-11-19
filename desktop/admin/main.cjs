const {app,BrowserWindow,session,Tray,Menu,Notification,nativeImage,shell,dialog,ipcMain,powerMonitor}=require('electron');
const path=require('node:path'),fs=require('node:fs'),http=require('node:http'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {ORIGIN,portalUrl,workspacePath,artworkUrl,externalUrl,AlertCursor}=require('./policy.cjs');
app.setAppUserModelId('fun.hymnmusic.admin');
if(!app.requestSingleInstanceLock()){app.quit();}else{
let home,portal,tray,authServer,authCancel,quitting=false,ses,timer,polling=false,authenticated=false,failures=0,lastExternal=0,authEpoch=0;
let message='Connect your Admin OS or Team OS account.',pairingLabel=null,settings={alerts:true},defaultPath='/admin',lastPath='/admin',identity=null;
let capabilities={admin:true,team:true};
const feeds={admin:new AlertCursor(),team:new AlertCursor()},pending={admin:null,team:null},notices=new Set(),images=new Map();
const homeUrl=pathToFileURL(path.join(__dirname,'home.html')).href;
const settingsFile=()=>path.join(app.getPath('userData'),'preferences.json');
const icon=()=>path.join(__dirname,'assets','icon.ico');
const startupOptions={name:'HYMN Admin OS',path:process.execPath,args:['--background']};
function save(){fs.writeFileSync(settingsFile(),JSON.stringify(settings),{mode:0o600});}
function resetFeeds(){for(const key of ['admin','team']){feeds[key].reset();pending[key]=null;}images.clear();identity=null;}
function closeNotices(){for(const notice of notices)notice.close();notices.clear();try{Notification.removeAll?.();}catch{}}
function windowOptions(extra={}){return {width:1440,height:960,minWidth:900,minHeight:620,backgroundColor:'#0d1117',icon:icon(),show:false,...extra,webPreferences:{session:ses,nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,spellcheck:false,backgroundThrottling:true,...extra.webPreferences}};}
function showHome(){
 if(!home||home.isDestroyed()){
  home=new BrowserWindow(windowOptions({width:720,height:820,minWidth:440,minHeight:680,webPreferences:{preload:path.join(__dirname,'preload.cjs')}}));
  home.loadURL(homeUrl);home.once('ready-to-show',()=>home.show());
  home.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  home.webContents.on('will-navigate',(event,url)=>{if(url!==homeUrl)event.preventDefault();});
  home.on('close',event=>{if(!quitting){event.preventDefault();home.hide();}});
 }else{home.show();home.focus();}
}
async function openExternal(url){
 const safe=externalUrl(url);if(!safe||Date.now()-lastExternal<1500)return;
 lastExternal=Date.now();
 const result=await dialog.showMessageBox({type:'question',title:'Open in browser?',message:`Open ${new URL(safe).hostname} in your browser?`,detail:'Only Admin OS and Team OS open inside this app.',buttons:['Cancel','Open browser'],defaultId:0,cancelId:0});
 if(result.response===1)await shell.openExternal(safe);
}
function recoverWorkspace(url){
 if(workspacePath(url)){lastPath=url;return;}
 if(!portal||portal.isDestroyed())return;
 portal.webContents.stop();
 if(/^https:\/\/hymnmusic\.fun\/(?:admin|team)\/(?:login|sign-in)/.test(url)){
  authenticated=false;authEpoch++;resetFeeds();closeNotices();message='Sign in through your browser to reconnect.';portal.hide();showHome();return;
 }
 void portal.loadURL(workspacePath(lastPath)||workspacePath(defaultPath));
}
function openPortal(href=defaultPath){
 const url=workspacePath(href)||workspacePath(defaultPath);
 if(!authenticated){showHome();return;}
 if(!portal||portal.isDestroyed()){
  portal=new BrowserWindow(windowOptions({webPreferences:{preload:path.join(__dirname,'workspace-preload.cjs')}}));
  lastPath=url;portal.loadURL(url);portal.once('ready-to-show',()=>portal.show());
  portal.webContents.setWindowOpenHandler(({url})=>{if(workspacePath(url))openPortal(url);else if(!portalUrl(url)||new URL(url).pathname.startsWith('/api/'))void openExternal(url);return {action:'deny'};});
  portal.webContents.on('will-navigate',(event,target)=>{if(!workspacePath(target))event.preventDefault();});
  portal.webContents.on('will-redirect',(event,target)=>{if(!workspacePath(target)){event.preventDefault();recoverWorkspace(target);}});
  portal.webContents.on('will-attach-webview',event=>event.preventDefault());
  portal.webContents.on('did-navigate',(_,url)=>recoverWorkspace(url));
  portal.webContents.on('did-navigate-in-page',(_,url,main)=>{if(main)recoverWorkspace(url);});
  portal.webContents.on('did-fail-load',(_,code,description,url,main)=>{if(main&&!workspacePath(url))recoverWorkspace(url);});
  portal.webContents.on('render-process-gone',()=>{message='The workspace stopped. Open it again to reload.';portal?.destroy();portal=null;showHome();});
  portal.on('close',event=>{if(!quitting){event.preventDefault();portal.hide();}});
 }else{if(portal.webContents.getURL()!==url)portal.loadURL(url);portal.show();portal.focus();}
 home?.hide();
}
async function notificationImage(event,epoch){
 const url=event.imageUrl&&artworkUrl(event.imageUrl);if(!url)return null;
 const cacheKey=`${identity}:${url}`;if(images.has(cacheKey))return images.get(cacheKey);
 try{
  const res=await ses.fetch(url,{credentials:'include',redirect:'error',signal:AbortSignal.timeout(4000)});
  if(!res.ok||!/^image\/(?:png|jpeg|webp)(?:;|$)/i.test(res.headers.get('content-type')||'')||Number(res.headers.get('content-length')||0)>2000000)return null;
  const reader=res.body.getReader(),chunks=[];let length=0;
  for(;;){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>2000000){await reader.cancel();return null;}chunks.push(Buffer.from(chunk.value));}
  const image=nativeImage.createFromBuffer(Buffer.concat(chunks));if(image.isEmpty()||epoch!==authEpoch)return null;
  const resized=image.resize({width:128,height:128});images.set(cacheKey,resized);
  while(images.size>40)images.delete(images.keys().next().value);
  return resized;
 }catch{return null;}
}
async function toast(event){
 if(!settings.alerts||!Notification.isSupported())return;
 const epoch=authEpoch,picture=await notificationImage(event,epoch);
 if(epoch!==authEpoch||!settings.alerts)return;
 const notice=new Notification({title:event.title,body:event.body,icon:picture||icon(),silent:false});
 notices.add(notice);notice.on('click',()=>openPortal(event.href));notice.on('close',()=>notices.delete(notice));
 notice.on('failed',()=>{notices.delete(notice);message='Check Windows notification settings to enable banners.';});notice.show();
}
function trayMenu(){
 if(!tray)return;tray.setToolTip(`HYMN Admin & Team OS — ${message.slice(0,80)}`);
 tray.setContextMenu(Menu.buildFromTemplate([
  {label:'Open Admin OS',enabled:capabilities.admin,click:()=>openPortal('/admin')},
  {label:'Open Team OS',enabled:capabilities.team,click:()=>openPortal('/team')},
  {label:'Connection & settings',click:showHome},{type:'separator'},
  {label:'Desktop notifications',type:'checkbox',checked:settings.alerts,click:item=>{settings.alerts=item.checked;save();trayMenu();}},
  {label:'Send a test notification',click:()=>void toast({title:'HYMN staff workspaces',body:'Admin OS and Team OS alerts are enabled.',href:defaultPath})},
  {type:'separator'},{label:message.slice(0,95),enabled:false},{label:'Quit HYMN Admin OS',click:()=>app.quit()}
 ]));
}
async function poll(){
 if(polling||quitting)return;polling=true;let epoch=authEpoch,delay=15000;
 try{
  for(const channel of ['admin','team']){
   let query=pending[channel]||`?channel=${channel}${feeds[channel].query()}`,pages=0;
   do{
    const res=await ses.fetch(`${ORIGIN}/api/desktop/events${query}`,{credentials:'include',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});
    if(epoch!==authEpoch)return;
    if(res.status===401||res.status===403){authenticated=false;resetFeeds();closeNotices();message='Workspace access expired or was revoked. Connect your account again.';if(portal&&!portal.isDestroyed())portal.hide();return;}
    if(res.status===400){feeds[channel].reset();pending[channel]=null;break;}
    if(!res.ok)throw new Error('Unavailable');
    const feed=await res.json();if(epoch!==authEpoch)return;
    if(identity&&identity!==feed.identity){authEpoch++;epoch=authEpoch;closeNotices();resetFeeds();}
    identity=feed.identity;
    capabilities={admin:feed.capabilities?.admin===true,team:feed.capabilities?.team===true};
    if(!capabilities.admin&&capabilities.team)defaultPath='/team';
    if(capabilities.admin&&!capabilities.team)defaultPath='/admin';
    if(portal&&!portal.isDestroyed()){
      const current=portalUrl(portal.webContents.getURL());
      if(current&&((current.pathname.startsWith('/admin')&&!capabilities.admin)||(current.pathname.startsWith('/team')&&!capabilities.team)))openPortal(defaultPath);
    }
    const alerts=feeds[channel].consume(feed);authenticated=true;
    for(const event of alerts.slice(0,3))void toast(event);
    if(alerts.length>3)void toast({title:'More workspace updates',body:`${alerts.length-3} more ${channel==='team'?'Team OS':'Admin OS'} updates are waiting in the staff inbox.`,href:channel==='team'?'/team?module=inbox':'/admin'});
    if(!feed.next){pending[channel]=null;break;}
    query=`?channel=${channel}&since=${encodeURIComponent(feed.next.since)}&after=${encodeURIComponent(feed.next.after)}&until=${encodeURIComponent(feed.until)}`;
    pending[channel]=query;pages++;
   }while(pages<100);
  }
  failures=0;message=settings.alerts?'Connected · Staff alerts enabled':'Connected · Staff alerts paused';
 }catch{failures++;delay=Math.min(120000,15000*2**Math.min(failures,3));message='Connection interrupted · Alerts will retry automatically.';}
 finally{polling=false;trayMenu();clearTimeout(timer);if(!quitting)timer=setTimeout(poll,delay);}
}

async function connect(){if(authServer)throw new Error('Finish the existing sign-in first.');const verifier=crypto.randomBytes(32).toString('base64url'),challenge=crypto.createHash('sha256').update(verifier).digest('base64url'),state=crypto.randomBytes(32).toString('hex');
 return new Promise((resolve,reject)=>{let timeout,finished=false,redeeming=false;const finish=(error)=>{if(finished)return;finished=true;pairingLabel=null;clearTimeout(timeout);authServer?.close();authServer=null;authCancel=null;if(error){message=error.message;reject(error);}else resolve();};authCancel=()=>finish(new Error('Sign-in cancelled.'));
 authServer=http.createServer(async(req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");res.setHeader('Content-Type','text/html; charset=utf-8');const address=authServer?.address();if(!address||typeof address==='string'||req.headers.host!==`127.0.0.1:${address.port}`){res.writeHead(400);res.end('Invalid callback.');return;}let url;try{url=new URL(req.url,'http://127.0.0.1');}catch{res.writeHead(400);res.end('Invalid callback.');return;}const code=url.searchParams.get('code');if(req.method!=='GET'||url.pathname!=='/callback'||url.searchParams.get('state')!==state||!code||code.length>2000){res.writeHead(400);res.end('This connection does not match the app.');return;}if(finished||redeeming){res.writeHead(409);res.end('Already handled.');return;}
 redeeming=true;try{const response=await ses.fetch(`${ORIGIN}/api/desktop-admin-auth`,{method:'POST',credentials:'include',redirect:'error',headers:{'Content-Type':'application/json',Origin:ORIGIN},body:JSON.stringify({action:'redeem',code,verifier}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error('Sign-in expired or access was denied. Connect again.');const result=await response.json();if(result.signedIn!==true)throw new Error('Sign-in was not confirmed.');authEpoch++;authenticated=true;resetFeeds();closeNotices();if(portal&&!portal.isDestroyed()){portal.destroy();portal=null;}defaultPath=workspacePath(result.defaultPath)||'/admin';message='Connected. Syncing admin alerts…';res.end('<title>HYMN Admin OS connected</title><main style="font:18px Segoe UI;padding:64px"><h1>You are connected.</h1><p>Return to HYMN Admin OS. You can close this tab.</p></main>');finish();clearTimeout(timer);void poll();openPortal();}catch(error){res.writeHead(401);res.end('Could not connect. Return to HYMN Admin OS and start again.');finish(error);}});
 authServer.on('error',finish);authServer.listen(0,'127.0.0.1',async()=>{try{const port=authServer.address().port;timeout=setTimeout(()=>finish(new Error('Sign-in timed out. Connect your account again.')),180000);const url=new URL('/desktop-connect',ORIGIN);url.searchParams.set('challenge',challenge);url.searchParams.set('port',port);url.searchParams.set('state',state);pairingLabel=`Pairing code: ${challenge.slice(0,8).toUpperCase()} — approve in your browser.`;await shell.openExternal(url.href);}catch(error){finish(error);}});
 });}

app.on('second-instance',()=>authenticated?openPortal():showHome());
app.on('before-quit',()=>{quitting=true;clearTimeout(timer);authCancel?.();});
app.on('window-all-closed',()=>{});
app.whenReady().then(()=>{
 try{settings={...settings,...JSON.parse(fs.readFileSync(settingsFile(),'utf8'))};settings.alerts=settings.alerts===true;}catch{}
 // Apply the requested startup default once on upgrade, then respect later opt-outs.
 if(!settings.startupConfigured&&!process.argv.includes('--verify-package')&&(app.isPackaged||process.env.HYMN_DESKTOP_TEST_PROFILE)){
  app.setLoginItemSettings({...startupOptions,openAtLogin:true});settings.startupConfigured=true;settings.startup=true;save();
 }
 ses=session.fromPartition('persist:hymn-admin-v1');ses.setUserAgent(ses.getUserAgent()+` HYMNAdmin/${app.getVersion()}`);
 ses.setPermissionRequestHandler((_,__,callback)=>callback(false));ses.setPermissionCheckHandler(()=>false);
 ses.webRequest.onBeforeRequest((details,callback)=>{
  if(details.resourceType==='mainFrame'&&details.webContentsId===portal?.webContents.id&&!workspacePath(details.url)){callback({cancel:true});return;}
  callback({});
 });
 ses.webRequest.onBeforeSendHeaders((details,callback)=>{
  if(details.webContentsId===portal?.webContents.id&&Object.entries(details.requestHeaders).some(([k,v])=>k.toLowerCase()==='rsc'&&String(v)==='1')&&!workspacePath(details.url)){callback({cancel:true});return;}
  callback({requestHeaders:details.requestHeaders});
 });
 ses.on('will-download',(event,item)=>{
  if(!item.getURLChain().every(value=>{try{const u=new URL(value);return u.protocol==='https:'||(u.protocol==='blob:'&&u.origin===ORIGIN);}catch{return false;}})||/\.(exe|msi|bat|cmd|com|ps1|scr|vbs|js|jar|lnk)$/i.test(item.getFilename())){event.preventDefault();return;}
  item.setSaveDialogOptions({title:'Save from HYMN staff workspace'});
 });
 ipcMain.handle('desktop:status',event=>{checkSender(event);return {message:pairingLabel??message,alerts:settings.alerts,startup:app.getLoginItemSettings(startupOptions).openAtLogin};});
 ipcMain.handle('desktop:connect',event=>{checkSender(event);return connect();});
 ipcMain.handle('desktop:open',event=>{checkSender(event);openPortal();});
 ipcMain.handle('desktop:alerts',(event,value)=>{checkSender(event);if(typeof value!=='boolean')throw new Error('Invalid setting');settings.alerts=value;save();trayMenu();});
 ipcMain.handle('desktop:startup',(event,value)=>{checkSender(event);if(typeof value!=='boolean')throw new Error('Invalid setting');app.setLoginItemSettings({...startupOptions,openAtLogin:value});settings.startupConfigured=true;settings.startup=value;save();});
 tray=new Tray(nativeImage.createFromPath(icon()).resize({width:24,height:24}));
 tray.on('double-click',()=>authenticated?openPortal():showHome());trayMenu();
 Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'HYMN staff workspaces',submenu:[{label:'Admin OS',accelerator:'CmdOrCtrl+1',click:()=>openPortal('/admin')},{label:'Team OS',accelerator:'CmdOrCtrl+2',click:()=>openPortal('/team')},{label:'Connection & settings',click:showHome},{type:'separator'},{role:'quit'}]},
  {label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
  {label:'View',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}
 ]));
 powerMonitor.on('resume',()=>{clearTimeout(timer);void poll();});
 if(!process.argv.includes('--background'))showHome();void poll();
});
function checkSender(event){if(!home||event.sender!==home.webContents||event.senderFrame!==home.webContents.mainFrame||event.senderFrame.url!==homeUrl)throw new Error('Untrusted request');}
}
