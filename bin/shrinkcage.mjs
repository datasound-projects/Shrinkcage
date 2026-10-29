#!/usr/bin/env node
import {launch} from './launch.mjs';
launch().catch(e=>{console.error(e.message);process.exitCode=1;});
