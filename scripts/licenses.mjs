import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {readFile,writeFile} from 'node:fs/promises';
const require=createRequire(new URL('../package.json',import.meta.url));const seen=new Set(),queue=['react','react-dom','recharts','smol-toml'];let output='# Third-party notices\n\nBrowser and Node dependencies shipped with Shrinkcage retain their respective licenses. This generated file includes their transitive runtime dependencies; development tools are installed separately.\n';
while(queue.length){const name=queue.shift();if(seen.has(name))continue;seen.add(name);let directory;try{directory=dirname(require.resolve(name+'/package.json'));}catch{try{directory=dirname(require.resolve(name));}catch{continue;}}
  let pkg;for(let i=0;i<8;i++){try{pkg=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));if(pkg.name===name)break;}catch{}directory=dirname(directory);pkg=null;}if(!pkg)continue;
  queue.push(...Object.keys(pkg.dependencies||{}));let text='';for(const file of ['LICENSE','LICENSE.md','LICENSE.txt','LICENCE','license'])try{text=await readFile(join(directory,file),'utf8');break;}catch{}
  output+=`\n## ${pkg.name} ${pkg.version}\n\nLicense: ${pkg.license||'See upstream package'}\n\n${text||'See the upstream package for its license text.'}\n`;
}
await writeFile('THIRD_PARTY_NOTICES.md',output.replace(/\r\n?/g,'\n').replace(/[ \t]+$/gm,'').trimEnd()+'\n');console.log(`Generated notices for ${seen.size} browser dependency names.`);
