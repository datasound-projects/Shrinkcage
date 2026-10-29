import { main } from './cli.js';
void main().then(code=>{process.exitCode=code;}).catch(()=>{console.error('Control CLI failed safely.');process.exitCode=1;});
