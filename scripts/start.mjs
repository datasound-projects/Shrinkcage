import {launch} from '../bin/launch.mjs';
launch({source:true}).catch(e=>{console.error(e.message);process.exitCode=1;});
