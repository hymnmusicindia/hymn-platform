// One process makes fixture shutdown reliable on Windows as well as Unix.
process.env.__NEXT_DEV_SERVER='1';
process.env.NEXT_PRIVATE_WORKER='1';
require('next/dist/server/lib/start-server').startServer({dir:process.cwd(),hostname:'127.0.0.1',port:35479,isDev:true,allowRetry:false}).catch(()=>{process.exitCode=1;});
