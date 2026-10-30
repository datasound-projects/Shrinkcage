import {readFile} from 'node:fs/promises';
import {verifyCatalog,parseCandidate} from '../server/registry/schema.ts';
const bytes=await readFile('registry/catalog.json'),integrity=JSON.parse(await readFile('registry/integrity.json','utf8'));
const {catalog}=verifyCatalog(bytes,integrity),queue=JSON.parse(await readFile('registry/review-queue.json','utf8'));
if(queue.schemaVersion!==1||!Array.isArray(queue.candidates))throw Error('Unsupported review queue schema.');
queue.candidates.forEach(parseCandidate);
for(const e of catalog.entries)if(!e.evidence.references.some(r=>r.kind==='review'))throw Error('Missing maintainer review reference: '+e.id);
console.log(`PASS: catalog ${catalog.version} revision ${catalog.revision}; ${catalog.entries.length} curated entries; ${queue.candidates.length} unapproved candidates; schema, provenance, gates and digest verified.`);
