import { ControlError } from '../control/schema.js';
export interface CachedDocument {value:unknown;etag:string|null;observedAt:string}
export interface DocumentResult extends CachedDocument {fresh:boolean;source:'network'|'revalidated'|'offline-cache';remaining:number|null;retryAt:string|null}
export interface TransportResponse {status:number;headers:Record<string,string>;value:unknown}
export type RegistryTransport=(url:string,headers:Record<string,string>,signal?:AbortSignal)=>Promise<TransportResponse>;
export function approvedEndpoint(value:string){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)throw new ControlError('Only trusted public metadata endpoints are allowed.');
  const github=u.hostname==='api.github.com'&&(/^\/repos\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+(?:\/(?:readme|license|releases(?:\/latest)?|topics|actions\/runs|commits\/(?:main|[a-f0-9]{40})|contents\/(?:registry\/(?:catalog|integrity)\.json|shrinkcage\.optimizer\.json|package\.json|pyproject\.toml|Cargo\.toml)|security-advisories))?$/.test(u.pathname)||u.pathname==='/search/repositories'||u.pathname==='/advisories');
  const npm=u.hostname==='registry.npmjs.org'&&/^\/(?:@[a-z0-9-]+%2[fF])?[a-zA-Z0-9_.-]+(?:\/latest)?$/.test(u.pathname)&&!u.search;
  const pypi=u.hostname==='pypi.org'&&/^\/pypi\/[A-Za-z0-9_.-]+\/json$/.test(u.pathname)&&!u.search;
  const crates=u.hostname==='crates.io'&&/^\/api\/v1\/crates\/[A-Za-z0-9_-]+$/.test(u.pathname)&&!u.search;
  if(!github&&!npm&&!pypi&&!crates)throw new ControlError('This URL is not a reviewed registry metadata endpoint.');
  if(github){const keys=[...u.searchParams.keys()];if(keys.some(k=>!['q','per_page','page','sort','order','status','ref','ecosystem','affects'].includes(k)))throw new ControlError('Unsupported metadata query.');if(u.search.length>800)throw new ControlError('Metadata query is oversized.');}
  return u;
}
export const defaultTransport:RegistryTransport=async(url,headers,signal)=>{approvedEndpoint(url);const timeout=AbortSignal.timeout(6000),combined=signal?AbortSignal.any([signal,timeout]):timeout;const r=await fetch(url,{headers,redirect:'error',signal:combined});let size=0;const chunks:Uint8Array[]=[];if(r.status!==304&&r.ok){const reader=r.body?.getReader();if(reader)while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>1024*1024){await reader.cancel();throw new ControlError('Registry metadata exceeded its bounded response limit.');}chunks.push(next.value);}}
  let value:unknown=null;if(r.ok&&r.status!==304)try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ControlError('Registry metadata was malformed; raw response discarded.');}return {status:r.status,headers:Object.fromEntries(['etag','x-ratelimit-remaining','x-ratelimit-reset','retry-after'].map(k=>[k,r.headers.get(k)??''])),value};};
export class RegistryNetwork {
  private active=0;private queue:(()=>void)[]=[];private flight=new Map<string,Promise<DocumentResult>>();private remaining:number|null=null;retryAt:string|null=null;
  constructor(readonly transport:RegistryTransport=defaultTransport,readonly env:NodeJS.ProcessEnv=process.env,readonly cache:{get:(url:string)=>CachedDocument|null;put:(url:string,value:CachedDocument)=>void}={get:()=>null,put:()=>{}}){}
  async get(url:string,signal?:AbortSignal):Promise<DocumentResult>{approvedEndpoint(url);const existing=this.flight.get(url);if(existing)return existing;const promise=this.request(url,signal).finally(()=>this.flight.delete(url));this.flight.set(url,promise);return promise;}
  private async request(url:string,signal?:AbortSignal):Promise<DocumentResult>{
    const cached=this.cache.get(url),offline=()=>{if(!cached)throw new ControlError('Public metadata is unavailable. Browse the shipped catalog or retry later.');return {...cached,fresh:false,source:'offline-cache' as const,remaining:this.remaining,retryAt:this.retryAt};};
    if(this.retryAt&&Date.now()<Date.parse(this.retryAt))return offline();
    if(this.active>=2)await new Promise<void>(r=>this.queue.push(r));else this.active++;
    try{if(signal?.aborted)throw new ControlError('Registry request cancelled.');const u=approvedEndpoint(url),headers:Record<string,string>={'Accept':'application/json','User-Agent':'Shrinkcage-Registry/1'};if(cached?.etag)headers['If-None-Match']=cached.etag;
      // Never forward GitHub credentials to package registries or arbitrary documentation hosts.
      const token=this.env.SHRINKCAGE_REGISTRY_GITHUB_TOKEN??this.env.GH_TOKEN??this.env.GITHUB_TOKEN;if(u.hostname==='api.github.com'&&token)headers.Authorization='Bearer '+token;
      const r=await this.transport(url,headers,signal);const n=r.headers['x-ratelimit-remaining'];if(n&&/^\d+$/.test(n))this.remaining=Number(n);
      if(r.status===429||r.status===403&&(r.headers['x-ratelimit-remaining']==='0'||!!r.headers['retry-after'])){const reset=Number(r.headers['x-ratelimit-reset']),after=Number(r.headers['retry-after']);this.retryAt=new Date(Number.isFinite(reset)&&reset>0?reset*1000:Date.now()+(Number.isFinite(after)&&after>0?Math.min(after,3600):60)*1000).toISOString();return offline();}
      if(r.status===304&&cached){const next={...cached,observedAt:new Date().toISOString()};this.cache.put(url,next);return {...next,fresh:true,source:'revalidated',remaining:this.remaining,retryAt:null};}
      if(r.status===404)throw new ControlError('Public repository or metadata document was not found.','missing',404);
      if(r.status!==200)throw new ControlError('Public metadata service could not complete the request.');
      if(u.hostname==='api.github.com'&&/^\/repos\/[^/]+\/[^/]+$/.test(u.pathname)&&(r.value as {private?:unknown})?.private===true)throw new ControlError('Only public repositories can be inspected. Private metadata was discarded.','private',403);if(u.pathname==='/search/repositories'&&r.value&&typeof r.value==='object'&&Array.isArray((r.value as any).items))r.value={...(r.value as any),items:(r.value as any).items.filter((item:any)=>item?.private===false)};const next={value:r.value,etag:r.headers.etag||null,observedAt:new Date().toISOString()};if(JSON.stringify(next).length>1024*1024)throw new ControlError('Metadata exceeds the cache budget.');this.cache.put(url,next);return {...next,fresh:true,source:'network',remaining:this.remaining,retryAt:null};
    }catch(e){if(signal?.aborted)throw new ControlError('Registry request cancelled.');if(cached)return offline();throw e instanceof ControlError?e:new ControlError('Public metadata is offline. No candidate code was executed.');}
    finally{const next=this.queue.shift();if(next)next();else this.active--;}
  }
}
