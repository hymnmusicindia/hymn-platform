const {contextBridge}=require('electron');
// Navigation policy only: no native API or credentials are exposed to remote pages.
contextBridge.executeInMainWorld({func:()=>{
 const allowed=value=>{try{const u=new URL(value,location.href);return u.origin==='https://hymnmusic.fun'&&/^\/(?:admin|team)(?:\/|$)/.test(u.pathname)&&!/^\/(?:admin|team)\/(?:login|sign-in)(?:\/|$)/.test(u.pathname);}catch{return false;}};
 document.addEventListener('click',event=>{const link=event.composedPath().find(node=>node instanceof HTMLAnchorElement);if(!link||link.hasAttribute('download')||!link.href||link.href.startsWith('blob:'))return;if(!allowed(link.href)){event.preventDefault();event.stopImmediatePropagation();}},true);
 for(const method of ['pushState','replaceState']){const original=history[method];history[method]=function(state,unused,url){if(url!=null&&!allowed(new URL(url,location.href).href))return;return original.apply(this,arguments);};}
}});
