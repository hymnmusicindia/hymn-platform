const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('hymnAdmin',Object.freeze({status:()=>ipcRenderer.invoke('desktop:status'),connect:()=>ipcRenderer.invoke('desktop:connect'),open:()=>ipcRenderer.invoke('desktop:open'),setAlerts:enabled=>ipcRenderer.invoke('desktop:alerts',enabled),setStartup:enabled=>ipcRenderer.invoke('desktop:startup',enabled)}));
