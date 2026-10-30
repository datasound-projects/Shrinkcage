import { createServer, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { VERSION } from './version.js';
import { timingSafeEqual } from 'node:crypto';
import type { Dashboard } from './types.js';
import type { WorkspaceRepository } from './workspace.js';
import type { ControlPlane } from './control/core.js';
import { controlRead,controlWrite } from './control/api.js';
import { ControlError } from './control/schema.js';
import { randomBytes } from 'node:crypto';

function body(req:IncomingMessage,max=8192):Promise<unknown>{return new Promise((resolve,reject)=>{
  let size=0;let rejected=false;const chunks:Buffer[]=[];
  req.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>max){if(!rejected)reject(new Error('Request too large'));rejected=true;return;}if(!rejected)chunks.push(chunk);});
  req.on('end',()=>{if(rejected)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new Error('Invalid JSON'));}});
  req.on('error',()=>reject(new Error('Request interrupted')));
});}
const sameToken=(left:unknown,right:string)=>typeof left==='string'&&/^[a-f0-9]{48}$/.test(left)&&left.length===right.length&&timingSafeEqual(Buffer.from(left),Buffer.from(right));

export function makeServer(collect:(force?:boolean)=>Promise<Dashboard>,staticRoot=resolve('dist'),workspace?:WorkspaceRepository,control?:ControlPlane){
  const controlToken=workspace?.csrfToken??randomBytes(24).toString('hex');
  const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.webmanifest':'application/manifest+json'};
  return createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const host=req.headers.host;
    if(!host||!/^(localhost|127\.0\.0\.1):\d+$/.test(host)||Number(host.split(':')[1])!==req.socket.localPort){res.writeHead(403);res.end('Local requests only');return;}
    const origins=[`http://localhost:${req.socket.localPort}`,`http://127.0.0.1:${req.socket.localPort}`];
    if(req.headers.origin&&!origins.includes(req.headers.origin)||req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);res.end('Origin denied');return;}
    const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:JSON.stringify(value));};
    let url:URL,pathname:string;
    try{url=new URL(req.url??'/','http://127.0.0.1');pathname=decodeURIComponent(url.pathname);}catch{json(400,{error:'Invalid request'});return;}
    if(control&&pathname.startsWith('/api/control/v1/')){
      try{
        if(url.search)throw new ControlError('Control routes do not accept query parameters.');
        if(req.method==='GET'||req.method==='HEAD'){json(200,await controlRead(control,pathname,controlToken));return;}
        if(req.method!=='POST'){res.setHeader('Allow','GET, HEAD, POST');json(405,{error:'Method not allowed'});return;}
        if(!req.headers.origin||!origins.includes(req.headers.origin)||!sameToken(req.headers['x-shrinkcage-token'],controlToken))throw new ControlError('Control actions require the local page capability and exact Origin.','approval',403);
        if(req.headers['content-type']!=='application/json')throw new ControlError('Expected application/json.');
        json(200,await controlWrite(control,pathname,await body(req,16384)));
      }catch(e){const size=e instanceof Error&&e.message==='Request too large',invalid=e instanceof Error&&e.message==='Invalid JSON';json(e instanceof ControlError?e.status:size?413:invalid?400:503,{error:e instanceof ControlError?e.message:size?'Request too large':invalid?'Invalid JSON':'Control data is unavailable. Existing monitoring remains independent.'});}
      return;
    }
    if(req.method==='POST'&&pathname==='/api/connectors/config'&&workspace){
      if(!req.headers.origin||!origins.includes(req.headers.origin)||!sameToken(req.headers['x-shrinkcage-token']??req.headers['x-shrinkage-token'],workspace.csrfToken)){json(403,{error:'This setting requires approval from the Shrinkcage page.'});return;}
      if(req.headers['content-type']!=='application/json'||url.search){json(400,{error:'Expected a JSON configuration without query parameters.'});return;}
      try{const data=await body(req);const result=await workspace.configure(data);json(200,result);}catch(e){const message=e instanceof Error?e.message:'';const safe=/^(Choose |The approved |The configured |Search |Unknown |Invalid |Request too large)/.test(message);json(message==='Request too large'?413:400,{error:safe?message:'Could not save approved connector settings. Check the folder and app-data permissions.'});}
      return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){res.setHeader('Allow','GET, HEAD');json(405,{error:'Method not allowed'});return;}
    if(url.search&&pathname!=='/api/sessions'){json(400,{error:'Query parameters are not supported here'});return;}
    if(pathname==='/api/health'){json(200,{app:'shrinkcage',status:'running',version:VERSION});return;}
    if(pathname==='/api/metrics'||pathname==='/api/refresh'){
      try{json(200,await collect(pathname==='/api/refresh'));}catch{json(503,{error:'Metrics collection failed. Retry on the next refresh.'});}return;
    }
    if(workspace&&(pathname==='/api/workspace'||pathname==='/api/discover')){
      try{json(200,await workspace.get(pathname==='/api/discover'));}catch{json(503,{error:'Local session discovery failed. Check access to agent session folders.'});}return;
    }
    if(workspace&&pathname==='/api/sessions'){
      try{json(200,await workspace.sessions(url.searchParams));}catch{json(400,{error:'Invalid session filters or session discovery unavailable.'});}return;
    }
    if(workspace&&/^\/api\/sessions\/[a-f0-9]{24}$/.test(pathname)){
      try{const session=await workspace.session(pathname.split('/').at(-1)!);json(session?200:404,session??{error:'Session not found in the current local index.'});}catch{json(503,{error:'Session metadata unavailable.'});}return;
    }
    const file=resolve(staticRoot,pathname==='/'?'index.html':`.${pathname}`);
    if(!file.startsWith(staticRoot+sep)||pathname.includes('\0')||!mime[extname(file)]||pathname.startsWith('/api/')){res.writeHead(404);res.end('Not found');return;}
    try{const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end('Not found');}
  });
}
