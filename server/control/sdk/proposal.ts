import type { OptimizerCandidate } from './types.js';
/** Review material only. No downloaded code, guessed executable arguments, or auto activation. */
export function integrationProposal(candidate:OptimizerCandidate){
  return {id:candidate.id,state:candidate.state,template:candidate.manifest?.template??'review-required',
    nextSteps: candidate.manifest?.template==='mcp-stdio'?[
      'Review the upstream source, documented stdio entry point and requested permissions.',
      'Install the tool independently. Register its local executable with an approval preview.',
      'Pass the isolated protocol gate. Then select it in one session and verify actual tool activity.',
    ]:['Review official documentation and identify a supported interface.','Implement a reviewed adapter template and conformance tests; metadata alone cannot activate a tool.','Keep this candidate Integration required until the review and tests pass.'],
    files:{'PROPOSAL.md':`# ${candidate.name}\n\nSource: ${candidate.url??'Local candidate'}\n\n${candidate.description}\n\n## Required review\n${candidate.missing.map(s=>'- '+s).join('\n')}\n\nDocument authentication boundaries, native approvals, isolation, lifecycle ownership, rollback, and telemetry provenance. Do not copy secrets or task content. The generated review adapter deliberately cannot execute anything. Run its boundary test with node --test adapter.review.test.mjs; replace it only through reviewed code and the full conformance suite.\n`,
      'adapter.review.mjs':`// Review scaffold only. No executable binding or guessed CLI flags.\nexport const metadata=${JSON.stringify({name:candidate.name,source:candidate.url,mechanism:candidate.mechanism})};\nexport const state='integration_required';\nexport const capabilities={discover:true,inspect:true,activate:false,install:false};\nexport function inspect(){return {metadata,state,capabilities};}\nexport function activate(){throw new Error('A reviewed implementation and validation evidence are required.');}\n`,
      'adapter.review.test.mjs':"import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport {inspect,activate} from './adapter.review.mjs';\ntest('unreviewed proposal cannot become operational',()=>{assert.equal(inspect().state,'integration_required');assert.equal(inspect().capabilities.activate,false);assert.throws(()=>activate(),/reviewed implementation/);});\n",
      ...(candidate.manifest?{'shrinkcage.optimizer.json':JSON.stringify(candidate.manifest,null,2)}:{}),
      'CONFORMANCE.md':'Required tests: strict manifest rejection; supported/unsupported agent and billing; isolated startup timeout/failure; handshake; version change; successful activity receipts; concurrent-session isolation; owned cleanup; failed update rollback; privacy. Gate 7 remains unavailable without controlled task-quality evidence.\n'},
    executionEnabled:false};
}
