import {readdir,readFile} from 'node:fs/promises';
const roots=['server','sdk','src','bin','scripts','tests','public','docs','.github'];
const files=['README.md','package.json','package-lock.json','start.sh','start.ps1','start.cmd','LICENSE','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','.env.example','.c8rc.json','index.html','vite.config.ts'];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true}).catch(()=>[])){const p=dir+'/'+e.name;if(e.isDirectory())await walk(p);else if(!p.endsWith('.png'))files.push(p);}}
for(const root of roots)await walk(root);
const forbidden=[/\/Users\/[A-Za-z][\w-]+\//,/C:\\Users\\[A-Za-z][\w-]+\\/i,/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/,/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/];
const bad=[];for(const p of files){const text=await readFile(p,'utf8').catch(()=>'');if(forbidden.some(r=>r.test(text)))bad.push(p);}
if(bad.length){console.error('Public-source scan failed: '+bad.join(', '));process.exit(1);}console.log('PASS: no machine-specific user paths or recognized credential patterns in distributable source. Manual review is still required before publication.');
