import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
const port=Number(process.env.PORT||3210);
const buckets=new Map(); let issued=0;
const same=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y)};
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
export const server=http.createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  try{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Permissions-Policy','microphone=(self), camera=()');
    if(url.pathname==='/api/status')return send(200,{liveAvailable:Boolean(process.env.ASSEMBLYAI_API_KEY),codeRequired:Boolean(process.env.DEMO_ACCESS_CODE),maxSessionSeconds:180});
    if(url.pathname==='/api/voice-token'){
      if(req.method!=='POST')return send(405,{error:'Use POST.'});
      const origin=req.headers.origin;
      if(!origin || new URL(origin).host!==req.headers.host)return send(403,{error:'Invalid request origin.'});
      const local=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      const code=process.env.DEMO_ACCESS_CODE;
      if((!local&&!code)||(code&&!same(req.headers['x-demo-code']||'',code)))return send(403,{error:'Enter the demo access code to start a live session.'});
      if(!process.env.ASSEMBLYAI_API_KEY)return send(503,{error:'Live voice is not configured. Try the guided demo.'});
      const ip=req.socket.remoteAddress,now=Date.now();
      const bucket=buckets.get(ip)||[]; const recent=bucket.filter(t=>now-t<3600000);
      if(recent.length>=6||issued>=30)return send(429,{error:'Demo session limit reached. The guided demo remains available.'});
      recent.push(now);buckets.set(ip,recent);issued++;
      const tokenUrl=new URL('https://agents.assemblyai.com/v1/token');
      tokenUrl.searchParams.set('expires_in_seconds','60'); tokenUrl.searchParams.set('max_session_duration_seconds','180');
      const upstream=await fetch(tokenUrl,{headers:{Authorization:`Bearer ${process.env.ASSEMBLYAI_API_KEY}`},signal:AbortSignal.timeout(15000)});
      if(!upstream.ok)return send(502,{error:`Voice service declined the session (${upstream.status}).`});
      const {token}=await upstream.json(); if(!token)return send(502,{error:'Voice service returned no token.'});
      return send(200,{token});
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return send(405,{error:'Method not allowed.'});
    const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
    const file=path.resolve(root,'.'+relative);
    if(!file.startsWith(root+path.sep))return send(403,{error:'Forbidden.'});
    const data=await readFile(file);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
  }catch(error){send(error.code==='ENOENT'?404:500,{error:error.code==='ENOENT'?'Not found.':'Request failed. Please try again.'});}
});
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(port,'127.0.0.1',()=>console.log(`Countback running at http://localhost:${port}`));
