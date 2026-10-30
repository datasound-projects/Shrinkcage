// Scheduled/terminal metadata research only. Never installs or runs a discovered tool.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {RegistryNetwork} from '../server/registry/network.ts';
import {inspectRepository,searchRepositories,communityCandidates,deduplicate,packageMetadata,attachPackageEvidence} from '../server/registry/discovery.ts';
import {verifyCatalog,parseCandidate} from '../server/registry/schema.ts';
import {DISCOVERY_QUERIES} from '../server/registry/taxonomy.ts';
import {discoveryBatch,discoveryProgress} from '../server/registry/schedule.ts';
const flags=process.argv.slice(2),option=(key,fallback)=>{const i=flags.indexOf(key);return i<0?fallback:flags[i+1];};
if(flags.some((v,i)=>v.startsWith('--')&&!['--query','--max','--dry-run','--community','--packages'].includes(v)))throw Error('Unsupported discovery option.');
const query=option('--query',null),limit=Number(option('--max','8'));if(!Number.isSafeInteger(limit)||limit<1||limit>12||query&&!Object.hasOwn(DISCOVERY_QUERIES,query))throw Error('Choose a supported query and a bounded batch of 1–12 repositories.');
const {catalog}=verifyCatalog(await readFile('registry/catalog.json'),JSON.parse(await readFile('registry/integrity.json','utf8')));
const queue=JSON.parse(await readFile('registry/review-queue.json','utf8'));queue.candidates.forEach(parseCandidate);
const oldState=await readFile('registry/discovery-state.json','utf8').then(JSON.parse).catch(()=>({schemaVersion:1,lastSuccessfulAt:null,queryCursor:0,repositories:[]}));if(oldState.schemaVersion!==1)throw Error('Unsupported discovery state version.');
const network=new RegistryNetwork(),errors=[],fresh=[],observed=[],packages=new Map();let names=[];const queries=Object.keys(DISCOVERY_QUERIES),selectedQuery=query??queries[oldState.queryCursor%queries.length];
try{names=await searchRepositories(network,selectedQuery);}catch(e){errors.push(e.message);}
if(flags.includes('--community'))try{names.push(...await communityCandidates(network));}catch(e){errors.push(e.message);}
if(flags.includes('--packages'))for(const entry of catalog.entries)for(const pkg of entry.packages){try{const p=await packageMetadata(network,pkg.registry,pkg.name,entry.source.repository);if(p.metadata.repositoryMatches&&p.repository){names.push(p.repository);const key=p.repository.toLowerCase();packages.set(key,[...(packages.get(key)??[]),p.metadata]);}else errors.push('Package provenance mismatch; excluded '+pkg.name);}catch(e){errors.push(e.message);}}
// Incremental monitoring: metadata/release changes trigger deep revalidation; unchanged repos keep prior gate timestamps.
for(const entry of catalog.entries){try{const base='https://api.github.com/repos/'+entry.source.repository;const [meta,release]=await Promise.all([network.get(base),network.get(base+'/releases/latest').catch(()=>null)]);observed.push({id:entry.source.repositoryId,repository:entry.source.repository,version:release?.value?.tag_name??null,checkedAt:meta.observedAt,pushedAt:meta.value?.pushed_at??null,archived:meta.value?.archived===true});}catch(e){errors.push(e.message);}}
const unique=discoveryBatch(oldState.repositories,observed,names,limit);
for(const name of unique){try{const known=catalog.entries.find(e=>e.source.repository.toLowerCase()===name);const candidate=await inspectRepository(name,network,{source:'scheduled-discovery',previousVersion:known?.upstream.version});if(known){candidate.id=known.id;candidate.entry.id=known.id;}if(packages.has(name))attachPackageEvidence(candidate,packages.get(name));fresh.push(candidate);}catch(e){errors.push(e.message);}if(network.retryAt)break;}
const candidates=deduplicate([...queue.candidates,...fresh]).slice(-200),report={schemaVersion:1,query:selectedQuery,inspected:fresh.length,curatedCatalogChanged:false,candidates:candidates.length,errors:[...new Set(errors)],rateLimitedUntil:network.retryAt,checkedAt:new Date().toISOString()};
await mkdir('artifacts',{recursive:true});await writeFile('artifacts/registry-discovery.json',JSON.stringify(report,null,2)+'\n');
if(!flags.includes('--dry-run')){const state={schemaVersion:1,lastSuccessfulAt:fresh.length?report.checkedAt:oldState.lastSuccessfulAt,queryCursor:(oldState.queryCursor+1)%queries.length,repositories:discoveryProgress(oldState.repositories,observed,fresh.map(c=>c.entry.source.repository))};for(const [name,value]of [['review-queue',{schemaVersion:1,candidates}],['discovery-state',state]]){const path='registry/'+name+'.json';await writeFile(path+'.tmp',JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(path+'.tmp',path);}}
console.log(JSON.stringify(report,null,2));if(!fresh.length&&errors.length)process.exitCode=2;
