import { createServer } from 'node:http';
import { openDatabase } from './database.mjs';
import { serve } from './app.mjs';
const env = {...process.env};
for (const key of ['DATABASE_PATH','SITE_ORIGIN','API_ORIGIN','ADMIN_PASSWORD_HASH','TOKEN_ENCRYPTION_KEY']) {
  if (!env[key]) throw new Error('Missing server configuration: '+key);
}
env.DB = openDatabase(env.DATABASE_PATH);
const server = createServer(async (req,res) => {
  try {
    if ((req.url || '').length > 4096) {res.writeHead(414); res.end(); return;}
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 8192) {res.writeHead(413); res.end('Request is too large.'); return;}
      chunks.push(chunk);
    }
    const headers = new Headers();
    for (const [key,value] of Object.entries(req.headers)) {
      if (value !== undefined) headers.set(key,Array.isArray(value)?value.join(','):value);
    }
    const request = new Request(new URL(req.url,env.API_ORIGIN),{
      method:req.method,headers,
      ...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)}),
    });
    // nginx overwrites X-Real-IP; the Node service accepts only loopback traffic.
    const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || 'local');
    const response = await serve(request,env,ip);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({error:'The booking service is temporarily unavailable.'}));
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(env.PORT || 8318),'127.0.0.1',()=>console.log('Meeting API listening on loopback port '+(env.PORT || 8318)));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{env.DB.close();process.exit(0);}));
