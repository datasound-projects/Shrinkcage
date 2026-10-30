import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {digest} from '../server/control/schema.js';
import type {RegistryTransport} from '../server/registry/network.js';
import type {RegistryCatalog} from '../server/registry/types.js';
const now='2026-10-30T05:00:00.000Z';
export async function bundled(){const bytes=await readFile(new URL('../registry/catalog.json',import.meta.url));const integrity=JSON.parse(await readFile(new URL('../registry/integrity.json',import.meta.url),'utf8'));const queue=JSON.parse(await readFile(new URL('../registry/review-queue.json',import.meta.url),'utf8')).candidates;return {bytes,integrity,queue};}
export const publicMetadata:RegistryTransport=async(url)=>{const u=new URL(url),path=u.pathname;let value:any;
  if(path==='/search/repositories')value={items:[{full_name:'example/future-output',private:false,fork:false,archived:false},{full_name:'example/fork',fork:true},{full_name:'example/old',archived:true}]};
  else if(path.endsWith('/readme'))value={encoding:'base64',content:Buffer.from(path.includes('generic')?'A generic AI application framework.':'Output compression for terminal tools. Supports Codex and Claude Code on macOS Windows Linux.').toString('base64'),sha:'a'.repeat(40),html_url:'https://github.com/example/future-output/blob/main/README.md'};
  else if(path.endsWith('/license'))value={encoding:'base64',content:Buffer.from('MIT License').toString('base64'),html_url:'https://github.com/example/future-output/blob/main/LICENSE'};
  else if(path.endsWith('/releases/latest'))value={tag_name:'v1.0.0',html_url:'https://github.com/example/future-output/releases/tag/v1.0.0',published_at:now};
  else if(path.endsWith('/releases'))value=[{tag_name:'v1.0.0',html_url:'https://github.com/example/future-output/releases/tag/v1.0.0',published_at:now}];
  else if(path.endsWith('/security-advisories'))value=[];
  else if(path.endsWith('/actions/runs'))value={workflow_runs:[]};
  else {const name=path.includes('generic')?'generic-ai':'future-output';value={id:name==='generic-ai'?90002:90001,private:false,name,full_name:'example/'+name,description:name==='generic-ai'?'General AI application framework':'Terminal tool-output compression for coding agents',homepage:'https://github.com/example/'+name,license:{spdx_id:'MIT'},default_branch:'main',pushed_at:now,archived:false,fork:false,open_issues_count:0,stargazers_count:0};}
  return {status:200,headers:{etag:'"fixture"'},value};
};
export function remoteCatalog(catalog:RegistryCatalog,corrupt=false):RegistryTransport {const bytes=Buffer.from(JSON.stringify(catalog,null,2)+'\n'),integrity=Buffer.from(JSON.stringify({schemaVersion:1,version:catalog.version,revision:catalog.revision,sha256:corrupt?'0'.repeat(64):digest(bytes)}));return async url=>{if(url.includes('/commits/main'))return {status:200,headers:{},value:{sha:'b'.repeat(40)}};const b=url.includes('/contents/registry/catalog.json')?bytes:integrity;return {status:200,headers:{},value:{type:'file',encoding:'base64',content:b.toString('base64'),sha:createHash('sha1').update(Buffer.concat([Buffer.from('blob '+b.length+'\0'),b])).digest('hex')}};};}
