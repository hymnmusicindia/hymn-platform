async function main(){
  const origin='https://hymnmusic.fun';
  for(const path of ['/','/pricing','/login','/distribution/start','/studio/start','/api/cron/health']){
    const response=await fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(30000)});
    const body=await response.text();
    console.log(JSON.stringify({path,status:response.status,location:response.headers.get('location'),planner:body.includes('Build a catalogue at your pace.'),bytes:body.length}));
  }
  if(process.argv.includes('--integration')){
    process.loadEnvFile('.env.hostinger');
    if(!process.env.CRON_SECRET)throw Error('Cron credential unavailable.');
    const response=await fetch(origin+'/api/cron/health',{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`},signal:AbortSignal.timeout(30000)});
    const body=await response.json();
    console.log(JSON.stringify({integrationHealthStatus:response.status,healthy:body.healthy,scheduler:body.scheduler,jobs:body.jobs?.filter((j:{id:string})=>['distribution-automation','direnote-ingest-status','direnote-release-sync'].includes(j.id)),review:body.review}));
  }
}
main().catch(()=>{console.error('Live smoke request failed; no credentials printed.');process.exitCode=1;});
