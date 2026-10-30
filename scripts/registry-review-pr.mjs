// Metadata review publication only; never changes repository policy or approves a candidate.
import {spawnSync} from 'node:child_process';
import {appendFileSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export function publicationResult(status,stderr){
  if(status===0)return 'created';
  if(String(stderr).includes('GitHub Actions is not permitted to create or approve pull requests'))return 'manual-review';
  throw Error('Review PR creation failed. Inspect the GitHub error; the candidate branch and evidence are preserved.');
}
export function publishReview(branch,bodyFile,run=spawnSync){
  if(!/^registry\/discovery-\d+$/.test(branch))throw Error('Expected a workflow-owned discovery branch.');
  readFileSync(bodyFile); // Fail before publication if the exact body is absent.
  const result=run('gh',['pr','create','--base','main','--head',branch,'--title','Review discovered optimizer candidates','--body-file',bodyFile],{encoding:'utf8',shell:false,timeout:30000});
  if(result.error)throw Error('The GitHub PR command could not complete; candidate branch preserved.');
  const state=publicationResult(result.status,result.stderr),link='https://github.com/datasound-projects/Shrinkcage/compare/main...'+branch+'?expand=1';
  if(state==='created')console.log(String(result.stdout).trim());
  else console.log('::warning::Discovery succeeded. Repository policy requires a maintainer to open the review PR; candidate evidence was saved.');
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,state==='created'?'Review-only PR prepared. No candidate was approved.\n':`Discovery passed; automatic PR creation is disabled by repository policy. [Open the saved review branch](${link}). The evidence artifact is retained; no repository permission was changed and no candidate was approved.\n`);
  return {state,link};
}
if(process.argv[1]===fileURLToPath(import.meta.url))publishReview(process.argv[2],process.argv[3]);
