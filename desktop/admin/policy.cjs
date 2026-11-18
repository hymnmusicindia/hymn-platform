const ORIGIN='https://hymnmusic.fun';
function portalUrl(value){try{const u=new URL(value);return u.origin===ORIGIN&&!u.username&&!u.password?u:null;}catch{return null;}}
function adminPath(value){const u=portalUrl(new URL(value,ORIGIN).href);return u&&(u.pathname==='/admin'||u.pathname.startsWith('/admin/'))?u.href:null;}
function externalUrl(value){try{const u=new URL(value);return !u.username&&!u.password&&u.protocol==='https:'?u.href:null;}catch{return null;}}
function parseFeed(value){if(!value||typeof value.identity!=='string'||!/^[a-f0-9]{64}$/.test(value.identity)||!Array.isArray(value.events)||value.events.length>100||!Number.isFinite(Date.parse(value.until)))throw new Error('Invalid alert response');for(const e of value.events)if(!e||typeof e.key!=='string'||e.key.length>160||typeof e.title!=='string'||e.title.length>150||typeof e.body!=='string'||e.body.length>300||!adminPath(e.href))throw new Error('Invalid alert');if(value.next&&(!Number.isSafeInteger(value.next.after)||value.next.after<0||!Number.isFinite(Date.parse(value.next.since))))throw new Error('Invalid page');return value;}
class AlertCursor{
 constructor(){this.reset();}
 reset(){this.identity=null;this.until=null;this.seen=new Set();this.baseline=true;}
 consume(feed){parseFeed(feed);if(this.identity!==feed.identity){this.reset();this.identity=feed.identity;}const alerts=[];for(const event of feed.events){if(!this.seen.has(event.key)&&!this.baseline)alerts.push(event);this.seen.add(event.key);}while(this.seen.size>10000)this.seen.delete(this.seen.values().next().value);if(!feed.next){this.until=feed.until;this.baseline=false;}return alerts;}
 query(){if(this.until&&Date.now()-Date.parse(this.until)>6*86400000)this.reset();return this.until?`?since=${encodeURIComponent(new Date(Date.parse(this.until)-120000).toISOString())}`:'';}
}
module.exports={ORIGIN,portalUrl,adminPath,externalUrl,parseFeed,AlertCursor};
