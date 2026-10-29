import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('release',{recursive:true});
if(!process.env.npm_execpath)throw new Error('Run npm run package so npm is available.');
const r=spawnSync(process.execPath,[process.env.npm_execpath,'pack','--json','--pack-destination','release'],{encoding:'utf8',shell:false});
if(r.status!==0){process.stderr.write(r.stderr);process.exit(1);}
const packed=JSON.parse(r.stdout)[0];const file='release/'+packed.filename;
const bytes=await readFile(file);const checksum=createHash('sha256').update(bytes).digest('hex');
await writeFile('release/SHA256SUMS',`${checksum}  ${packed.filename}\n`);
console.log(JSON.stringify({archive:file,sha256:checksum,files:packed.files.map(x=>x.path)},null,2));
