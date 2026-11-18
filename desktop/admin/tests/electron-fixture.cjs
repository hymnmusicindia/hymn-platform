const real=require('electron'),Module=require('node:module'),path=require('node:path'),{EventEmitter}=require('node:events');
real.app.setPath('userData',path.resolve(process.env.HYMN_DESKTOP_TEST_PROFILE));
real.BrowserWindow.prototype.show=function(){};
real.app.getLoginItemSettings=()=>({openAtLogin:!!global.startup});real.app.setLoginItemSettings=value=>{global.startup=value.openAtLogin;};
global.alerts=[];global.feedEvents=[];global.feedDenied=false;global.pairUrl=null;
class FakeNotification extends EventEmitter{static isSupported(){return true;}constructor(options){super();this.options=options;}show(){global.alerts.push(this);}close(){this.emit('close');}}
const original=Module._load;Module._load=function(request,parent,isMain){if(request==='electron')return {...real,Notification:FakeNotification,shell:{...real.shell,openExternal:async url=>{global.pairUrl=url;}},session:{fromPartition(name){const s=real.session.fromPartition(name);s.fetch=async url=>{if(url.endsWith('/desktop-admin-auth'))return new Response(JSON.stringify({signedIn:true}));return new Response(JSON.stringify(global.feedDenied?{error:'Forbidden'}:{identity:'a'.repeat(64),events:global.feedEvents,until:new Date(Date.now()-3000).toISOString(),next:null}),{status:global.feedDenied?403:200});};s.protocol.handle('https',()=>new Response('<!doctype html><title>Fixture admin portal</title><h1>Admin fixture</h1>'));return s;}}};return original.apply(this,arguments);};
require('../main.cjs');
