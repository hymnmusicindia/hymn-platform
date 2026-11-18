const byId=id=>document.getElementById(id);
async function refresh(){try{const state=await window.hymnAdmin.status();byId('status').textContent=state.message;byId('alerts').checked=state.alerts;byId('startup').checked=state.startup;}catch{byId('status').textContent='Could not read app status. Restart HYMN Admin OS.';}}
byId('connect').addEventListener('click',async()=>{byId('connect').disabled=true;byId('status').textContent='Finish sign-in in your browser, then approve this computer.';try{await window.hymnAdmin.connect();}catch{byId('status').textContent='Could not connect. Open the app and try again.';}finally{byId('connect').disabled=false;await refresh();}});
byId('open').addEventListener('click',()=>window.hymnAdmin.open());
byId('alerts').addEventListener('change',async e=>{await window.hymnAdmin.setAlerts(e.target.checked);await refresh();});
byId('startup').addEventListener('change',async e=>{await window.hymnAdmin.setStartup(e.target.checked);await refresh();});
refresh();setInterval(refresh,3000);
