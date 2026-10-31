import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {detectAgent,nativeClaudeShim} from '../server/control/probe.js';
import {fakeWorkspace} from './control-fixtures.js';
test('reviewed Codex families remain bounded and native Claude Windows shims resolve without a shell',async()=>{const f=await fakeWorkspace();try{for(const [version,compatible]of [['0.166.0',true],['0.166.1',true],['0.167.0',false],['0.164.0',false],['0.166.0-beta',false]] as const)assert.equal((await detectAgent({...f.env,FIXTURE_CODEX_VERSION:version},'codex')).compatible,compatible,version);
  const prefix=join(f.root,'native-prefix'),dir=join(prefix,'node_modules','@anthropic-ai','claude-code','bin'),native=join(dir,'claude.exe');await mkdir(dir,{recursive:true});await writeFile(native,'MZ-native-test-fixture');const found=await nativeClaudeShim(prefix);assert.equal(found?.command,native);assert.deepEqual(found?.prefix,[]);await writeFile(native,'echo installer placeholder');assert.equal(await nativeClaudeShim(prefix),null);await rm(native);await writeFile(join(f.root,'external.exe'),'MZ-unowned-test-fixture');await symlink(join(f.root,'external.exe'),native,'file');assert.equal(await nativeClaudeShim(prefix),null);
}finally{await f.close();}});
