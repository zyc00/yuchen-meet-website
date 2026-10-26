import { readFile } from 'node:fs/promises';
import { handleApi } from './lib/server/api.mjs';
import { ownerIdentity } from './lib/booking/security.mjs';
const staticRoot = new URL('./static/', import.meta.url);
const sharedHeaders = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function serve(request, env, clientIp = 'shared') {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const allowed = origin === env.SITE_ORIGIN || origin === env.API_ORIGIN;
  if (request.method === 'OPTIONS') {
    if (!allowed || !['GET','POST'].includes(request.headers.get('access-control-request-method'))) return new Response(null,{status:403});
    return new Response(null,{status:204,headers:{
      'Access-Control-Allow-Origin':origin,
      'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':'Content-Type, Authorization',
      'Access-Control-Max-Age':'600', 'Vary':'Origin',
    }});
  }
  let response;
  if (url.pathname.startsWith('/api/')) {
    response = await handleApi(request, env, clientIp);
  } else if (url.pathname === '/admin' || url.pathname === '/admin/') {
    try {
      ownerIdentity(request.headers, env);
      response = new Response(await readFile(new URL('index.html',staticRoot)),{headers:{...sharedHeaders,'Content-Type':'text/html; charset=utf-8'}});
    } catch (error) {
      response = error.status === 401
        ? new Response('Sign in to manage your schedule.',{status:401,headers:{...sharedHeaders,'WWW-Authenticate':'Basic realm="Yuchen meeting administration", charset="UTF-8"'}})
        : new Response('Administration is temporarily unavailable.',{status:503,headers:sharedHeaders});
    }
  } else if (/^\/admin-assets\/[a-zA-Z0-9._-]+\.(js|css)$/.test(url.pathname)) {
    try {
      response = new Response(await readFile(new URL(url.pathname.slice(1),staticRoot)),{headers:{
        ...sharedHeaders, 'Cache-Control':'public, max-age=31536000, immutable',
        'Content-Type':url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8',
      }});
    } catch { response = new Response('Not found',{status:404,headers:sharedHeaders}); }
  } else if (url.pathname === '/') {
    response = Response.redirect(env.SITE_ORIGIN,302);
  } else {
    response = new Response('Not found',{status:404,headers:sharedHeaders});
  }
  const headers = new Headers(response.headers);
  headers.set('Vary','Origin');
  if (allowed) headers.set('Access-Control-Allow-Origin',origin);
  return new Response(response.body,{status:response.status,headers});
}
