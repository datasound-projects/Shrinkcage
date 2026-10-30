#!/usr/bin/env node
import {launch,checkRuntime} from './launch.mjs';
let supported=true;try{checkRuntime();}catch(e){console.error(e.message);process.exitCode=1;supported=false;}
const args=process.argv.slice(2);
if(!supported){/* Do not import SQLite or control dependencies on an unsupported runtime. */}
else if(args[0]==='ui'){process.argv.splice(2,1);launch().catch(e=>{console.error(e.message);process.exitCode=1;});}
else if(['doctor','tools','tool','profile','plan','run','sessions','extension','help','--help'].includes(args[0])){
  import('../dist-server/server/control/cli.js').then(({main})=>main(args)).then(code=>{process.exitCode=code;}).catch(()=>{console.error('Control commands require a complete build. Run npm run build or install the release package.');process.exitCode=1;});
}else launch().catch(e=>{console.error(e.message);process.exitCode=1;});
