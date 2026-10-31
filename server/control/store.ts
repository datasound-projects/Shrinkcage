import { DatabaseSync } from 'node:sqlite';
import { chmodSync, closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { appDataDir } from '../platform.js';
import { ControlError, digest, fingerprint, parseProfile, parseLaunchOptions, type SchemaContext } from './schema.js';
import { TOOL_IDS } from './types.js';
import { parsePluginManifest, pluginConfiguration } from './sdk/manifest.js';
import type { OptimizerCandidate, RegisteredPlugin, ValidationReport } from './sdk/types.js';
import { EMPTY_ACCOUNTING, parseAccounting } from './accounting.js';
import { DEFAULT_PROFILES } from './profiles.js';
import type { LaunchPreview,TerminalLaunch } from './terminal-types.js';
import type { AccountingSettings, Benchmark, ManagedSession, ProjectRef, SavedProfile, SessionPreference, SetupReceipt } from './types.js';

export class ControlStore {
  readonly dir:string;private db:DatabaseSync;
  constructor(dataDir=appDataDir()){
    mkdirSync(dataDir,{recursive:true,mode:0o700});const root=realpathSync(dataDir);this.dir=join(root,'control');
    if(existsSync(this.dir)&&lstatSync(this.dir).isSymbolicLink())throw new ControlError('Control data directory must not be a symlink.');
    mkdirSync(this.dir,{recursive:true,mode:0o700});chmodSync(this.dir,0o700);
    const file=join(this.dir,'state.sqlite');
    if(existsSync(file)){const s=lstatSync(file);if(s.isSymbolicLink()||!s.isFile()||s.size>64*1024*1024)throw new ControlError('Unsafe or oversized control state.');}
    else{const fd=openSync(file,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY,0o600);closeSync(fd);}
    chmodSync(file,0o600);this.db=new DatabaseSync(file);
    try{
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
    const version=(this.db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version;
    if(version>2)throw new ControlError('Control state was created by a newer Shrinkcage version.');
    const journal=this.db.prepare('PRAGMA journal_mode').all()[0]?.journal_mode;if(journal!=='wal')this.db.exec('PRAGMA journal_mode=WAL;');
    if(version===0)this.transaction(()=>this.db.exec(`CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, label TEXT NOT NULL, path TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, owner_pid INTEGER NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS comparisons(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT NOT NULL, event TEXT NOT NULL, resource TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS extensions(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS locks(project_id TEXT PRIMARY KEY, token TEXT NOT NULL, pid INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS session_preferences(id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, value TEXT NOT NULL);
      INSERT OR IGNORE INTO settings(id,value) VALUES('schema','{"version":2}');
      PRAGMA user_version=1;`));
    // Additive schema: retain the v1 compatibility floor so an existing owned
    // launcher/guardian can reopen the store while its current session finishes.
    else if(version===1&&!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_preferences'").get())this.transaction(()=>this.db.exec(`CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS session_preferences(id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE, value TEXT NOT NULL);
      INSERT OR IGNORE INTO settings(id,value) VALUES('schema','{"version":2}');`));
    if(!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='optimizer_plugins'").get())this.transaction(()=>this.db.exec(`
      CREATE TABLE IF NOT EXISTS optimizer_plugins(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS optimizer_candidates(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS optimizer_validation(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO settings(id,value) VALUES('schema','{"version":3}') ON CONFLICT(id) DO UPDATE SET value=excluded.value;`));
    if(!this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='registry_cache'").get())this.transaction(()=>this.db.exec(`
      CREATE TABLE IF NOT EXISTS registry_cache(id TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS registry_candidates(id TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS registry_documents(url TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS registry_jobs(id TEXT PRIMARY KEY,value TEXT NOT NULL);
      INSERT INTO settings(id,value) VALUES('schema','{"version":4}') ON CONFLICT(id) DO UPDATE SET value=excluded.value;`));
    this.db.exec('CREATE TABLE IF NOT EXISTS terminal_previews(id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS terminal_launches(id TEXT PRIMARY KEY, value TEXT NOT NULL);');
    }catch(e){try{this.db.close();}catch{/* preserve the initialization failure */}throw e;}
  }
  close(){this.db.close();}
  saveTerminalPreview(value:LaunchPreview){this.db.prepare('INSERT INTO terminal_previews(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(value.fingerprint,JSON.stringify(value));this.db.exec('DELETE FROM terminal_previews WHERE rowid NOT IN (SELECT rowid FROM terminal_previews ORDER BY rowid DESC LIMIT 100)');}
  terminalPreview(id:string):LaunchPreview|null{const row=this.db.prepare('SELECT value FROM terminal_previews WHERE id=?').get(id);return row?this.decode(row.value):null;}
  terminalLaunch(id:string):TerminalLaunch|null{const row=this.db.prepare('SELECT value FROM terminal_launches WHERE id=?').get(id);return row?this.decode(row.value):null;}
  terminalLaunches():TerminalLaunch[]{return this.db.prepare('SELECT value FROM terminal_launches ORDER BY rowid DESC LIMIT 100').all().map(row=>this.decode<TerminalLaunch>(row.value));}
  reserveTerminalLaunch(value:TerminalLaunch):boolean{const added=Number(this.db.prepare('INSERT OR IGNORE INTO terminal_launches(id,value) VALUES(?,?)').run(value.id,JSON.stringify(value)).changes)>0;this.db.prepare("DELETE FROM terminal_launches WHERE rowid NOT IN (SELECT rowid FROM terminal_launches ORDER BY rowid DESC LIMIT 100) AND (json_extract(value,'$.state') IN ('failed','exited') OR (json_extract(value,'$.sessionId') IS NULL AND json_extract(value,'$.expiresAt') < ?))").run(Date.now());return added;}
  updateTerminalLaunch(id:string,patch:Partial<Pick<TerminalLaunch,'state'|'sessionId'|'error'|'scriptHash'>>){return this.transaction(()=>{const value=this.terminalLaunch(id);if(!value)throw new ControlError('Terminal launch not found.');const next={...value,...patch};this.db.prepare('UPDATE terminal_launches SET value=? WHERE id=?').run(JSON.stringify(next),id);return next;});}
  claimTerminalLaunch(id:string):TerminalLaunch{return this.transaction(()=>{const value=this.terminalLaunch(id);if(!value||!['opening','waiting'].includes(value.state)||value.expiresAt<=Date.now())throw new ControlError('This launch approval expired or was already used. Review and start a new session.','approval',409);value.state='claimed';this.db.prepare('UPDATE terminal_launches SET value=? WHERE id=?').run(JSON.stringify(value),id);return value;});}
  lockProof(projectId:string){return this.db.prepare('SELECT token,pid FROM locks WHERE project_id=?').get(projectId) as {token:string;pid:number}|undefined;}
  reserveLock(projectId:string,token:string){return Number(this.db.prepare('INSERT OR IGNORE INTO locks(project_id,token,pid) VALUES(?,?,?)').run(projectId,token,process.pid).changes)>0;}
  reclaimLock(projectId:string,oldToken:string,token:string){return Number(this.db.prepare('UPDATE locks SET token=?,pid=? WHERE project_id=? AND token=?').run(token,process.pid,projectId,oldToken).changes)>0;}
  releaseLock(projectId:string,token:string){this.db.prepare('DELETE FROM locks WHERE project_id=? AND token=?').run(projectId,token);}
  private decode<T>(value:unknown):T {try{if(typeof value!=='string'||value.length>1048576)throw Error();return JSON.parse(value) as T;}catch{throw new ControlError('Stored control data is malformed. Back it up before recovery.','corrupt',503);}}
  private transaction<T>(fn:()=>T):T {this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  audit(event:string,resource:string){this.db.prepare('INSERT INTO audit(at,event,resource) VALUES(?,?,?)').run(new Date().toISOString(),event,resource);this.db.exec('DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT 500)');}
  profiles():SavedProfile[]{
    const result=DEFAULT_PROFILES.map(p=>structuredClone(p));
    for(const row of this.db.prepare('SELECT id,revision,value FROM profiles ORDER BY id LIMIT 100').all() as {id:string;revision:number;value:string}[]){const profile=parseProfile(this.decode(row.value),this.schemaContext());const i=result.findIndex(p=>p.profile.id===profile.id);const saved={profile,revision:row.revision,builtin:false};if(i<0)result.push(saved);else result[i]=saved;}
    return result;
  }
  saveProfile(value:unknown,revision:number):SavedProfile{
    const profile=parseProfile(value,this.schemaContext());if(profile.id==='baseline')throw new ControlError('Baseline is immutable; create a custom profile instead.');
    if(!Number.isSafeInteger(revision)||revision<0)throw new ControlError('Expected a valid profile revision.');
    return this.transaction(()=>{
      const row=this.db.prepare('SELECT revision FROM profiles WHERE id=?').get(profile.id) as {revision:number}|undefined;
      if((row?.revision??0)!==revision)throw new ControlError('The profile changed in another window. Refresh before saving.','conflict',409);
      if(!row&&(this.db.prepare('SELECT count(*) AS n FROM profiles').get() as {n:number}).n>=100)throw new ControlError('The profile limit is 100.');
      this.db.prepare('INSERT INTO profiles(id,revision,value) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,value=excluded.value').run(profile.id,revision+1,JSON.stringify(profile));this.audit('profile.saved',profile.id);return {profile,revision:revision+1,builtin:false};
    });
  }
  removeProfile(id:string,revision:number){if(id==='baseline')throw new ControlError('Baseline cannot be removed.');const result=this.db.prepare('DELETE FROM profiles WHERE id=? AND revision=?').run(id,revision);if(!Number(result.changes))throw new ControlError('Profile missing or revision changed.','conflict',409);this.audit('profile.removed',id);}
  registerProject(ref:ProjectRef,path:string){if(!this.projectPath(ref.id)&&(this.db.prepare('SELECT count(*) AS n FROM projects').get() as {n:number}).n>=200)throw new ControlError('The approved project limit is 200.');this.db.prepare('INSERT INTO projects(id,label,path) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET label=excluded.label,path=excluded.path').run(ref.id,ref.label,path);}
  projects():ProjectRef[]{return this.db.prepare('SELECT id,label FROM projects ORDER BY label LIMIT 200').all() as unknown as ProjectRef[];}
  projectPath(id:string):string|null {return (this.db.prepare('SELECT path FROM projects WHERE id=?').get(id) as {path:string}|undefined)?.path??null;}
  createSession(session:ManagedSession,token:string,pluginFingerprints:Record<string,string>={}){
    return this.transaction(()=>{
      this.prune();if(this.sessionCount()>=2000)throw new ControlError('The managed record limit is 2000. Remove old completed metadata before another launch.');
      for(const id of session.plannedTools)if(!TOOL_IDS.includes(id as never)){const plugin=this.plugin(id);if(!plugin||plugin.lifecycle==='removing'||plugin.binding.fingerprint!==pluginFingerprints[id])throw new ControlError('A selected plugin changed or was removed before session ownership was reserved.');}
      this.db.prepare('INSERT INTO sessions(id,token_hash,owner_pid,value) VALUES(?,?,?,?)').run(session.id,digest(token),process.pid,JSON.stringify(session));this.audit('session.created',session.id);
    });
  }
  owns(id:string,token:string):boolean{return (this.db.prepare('SELECT token_hash FROM sessions WHERE id=?').get(id) as {token_hash:string}|undefined)?.token_hash===digest(token);}
  updateSession(session:ManagedSession,token:string){const result=this.db.prepare('UPDATE sessions SET value=? WHERE id=? AND token_hash=?').run(JSON.stringify(session),session.id,digest(token));if(!Number(result.changes))throw new ControlError('Session ownership could not be verified.','ownership',403);}
  session(id:string):ManagedSession|null {
    const row=this.db.prepare('SELECT value FROM sessions WHERE id=?').get(id) as {value:string}|undefined;
    if(!row)return null;return this.decorateSession(this.decode<ManagedSession>(row.value));
  }
  private decorateSession(session:ManagedSession):ManagedSession {
    const row=this.db.prepare('SELECT value FROM session_preferences WHERE id=?').get(session.id) as {value:string}|undefined;
    if(row)session.pending=this.decode<SessionPreference>(row.value);
    if(['preflight','starting','running','degraded','stopping'].includes(session.status)&&Date.now()-Date.parse(session.heartbeatAt)>30000)return {...session,status:'abandoned',diagnostics:[...session.diagnostics,'Owner heartbeat expired. No persisted PID will be signalled.']};
    return session;
  }
  setSessionPreference(id:string,value:unknown,expectedPending?:string):SessionPreference {return this.transaction(()=>{
    if(expectedPending!==undefined&&fingerprint(this.session(id)?.pending??null)!==expectedPending)throw new ControlError('Next-launch settings changed during review.','conflict',409);
    if(!this.session(id))throw new ControlError('Managed session not found.','missing',404);
    const options=parseLaunchOptions(value,this.schemaContext());if(!options.tools||options.billing!==undefined||options.model!==undefined)throw new ControlError('Choose an explicit next-launch tool stack.');
    if(Object.keys(options.toolConfig??{}).some(tool=>!options.tools!.includes(tool as never)))throw new ControlError('Configuration supplied for an unselected tool.');
    const pending:SessionPreference={tools:options.tools,toolConfig:options.toolConfig??{},state:'requires-restart',updatedAt:new Date().toISOString()};
    this.db.prepare('INSERT INTO session_preferences(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,JSON.stringify(pending));this.audit('session.next-launch',id);return pending;
  });}
  clearSessionPreference(id:string){this.db.prepare('DELETE FROM session_preferences WHERE id=?').run(id);}
  accounting():AccountingSettings {const row=this.db.prepare('SELECT value FROM settings WHERE id=?').get('accounting') as {value:string}|undefined;return row?parseAccounting(this.decode(row.value)):structuredClone(EMPTY_ACCOUNTING);}
  saveAccounting(value:unknown):AccountingSettings {const settings=parseAccounting(value);this.db.prepare('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run('accounting',JSON.stringify(settings));this.audit('accounting.updated','accounting');return settings;}
  sessionCount():number {return Number(this.db.prepare('SELECT count(*) AS n FROM sessions').get()!.n);}
  activeCount():number {return Number(this.db.prepare("SELECT count(*) AS n FROM sessions WHERE json_extract(value,'$.status') IN ('preflight','starting','running','degraded','stopping') AND julianday(json_extract(value,'$.heartbeatAt')) > julianday('now','-30 seconds')").get()!.n);}
  sessions(offset=0,limit=200):ManagedSession[]{
    if(!Number.isSafeInteger(offset)||offset<0||offset>2000||!Number.isSafeInteger(limit)||limit<1||limit>200)throw new ControlError('Session pagination is outside its bounded range.');
    return (this.db.prepare('SELECT value FROM sessions ORDER BY rowid DESC LIMIT ? OFFSET ?').all(limit,offset) as {value:string}[]).map(row=>{
      return this.decorateSession(this.decode<ManagedSession>(row.value));
    });
  }
  removeSession(id:string){const s=this.session(id);if(!s)throw new ControlError('Managed session not found.','missing',404);if(!['exited','failed','abandoned'].includes(s.status))throw new ControlError('Stop this session in its owning terminal before deleting metadata.');this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);}
  prune(days=90){if(!Number.isSafeInteger(days)||days<1||days>3650)throw new ControlError('Retention must be between 1 and 3650 days.');const cutoff=new Date(Date.now()-days*86400000).toISOString();this.db.prepare("DELETE FROM sessions WHERE COALESCE(json_extract(value,'$.endedAt'),json_extract(value,'$.heartbeatAt')) < ?").run(cutoff);this.db.exec('DELETE FROM comparisons WHERE rowid NOT IN(SELECT rowid FROM comparisons ORDER BY rowid DESC LIMIT 100)');}
  putReceipt(receipt:SetupReceipt){if(!this.db.prepare('SELECT id FROM receipts WHERE id=?').get(receipt.id)&&(this.db.prepare('SELECT count(*) AS n FROM receipts').get() as {n:number}).n>=200)throw new ControlError('The owned setup receipt limit is 200. Retain backups and review cleanup before another setup.');this.db.prepare('INSERT INTO receipts(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(receipt.id,JSON.stringify(receipt));}
  receipts():SetupReceipt[]{return (this.db.prepare('SELECT value FROM receipts ORDER BY rowid DESC LIMIT 200').all() as {value:string}[]).map(row=>this.decode<SetupReceipt>(row.value));}
  addComparison(value:Omit<Benchmark,'id'>):Benchmark{const b={...value,id:randomUUID()};this.db.prepare('INSERT INTO comparisons(id,value) VALUES(?,?)').run(b.id,JSON.stringify(b));this.prune();return b;}
  comparisons():Benchmark[]{return (this.db.prepare('SELECT value FROM comparisons ORDER BY rowid DESC LIMIT 100').all() as {value:string}[]).map(row=>this.decode<Benchmark>(row.value));}
  putExtension(id:string,value:unknown){return this.transaction(()=>{if(this.plugin(id))throw new ControlError('A registered plugin already owns this ID.');if(!this.db.prepare('SELECT id FROM extensions WHERE id=?').get(id)&&(this.db.prepare('SELECT count(*) AS n FROM extensions').get() as {n:number}).n>=30)throw new ControlError('The extension preview limit is 30.');this.db.prepare('INSERT INTO extensions(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,JSON.stringify(value));});}
  extensions():unknown[]{return (this.db.prepare('SELECT value FROM extensions ORDER BY id').all() as {value:string}[]).map(row=>this.decode(row.value));}
  removeExtension(id:string){this.db.prepare('DELETE FROM extensions WHERE id=?').run(id);this.audit('extension.removed',id);}
  plugins():RegisteredPlugin[]{return (this.db.prepare('SELECT value FROM optimizer_plugins ORDER BY id').all() as {value:string}[]).map(row=>{const p=this.decode<RegisteredPlugin>(row.value);p.manifest=parsePluginManifest(p.manifest);return p;});}
  plugin(id:string):RegisteredPlugin|null {const row=this.db.prepare('SELECT value FROM optimizer_plugins WHERE id=?').get(id) as {value:string}|undefined;if(!row)return null;const p=this.decode<RegisteredPlugin>(row.value);p.manifest=parsePluginManifest(p.manifest);return p;}
  putPlugin(plugin:RegisteredPlugin,expected:string|null){
    parsePluginManifest(plugin.manifest);if(JSON.stringify(plugin).length>65536)throw new ControlError('Plugin registration exceeds the private record limit.');
    return this.transaction(()=>{const current=this.plugin(plugin.manifest.id);if(this.db.prepare('SELECT id FROM extensions WHERE id=?').get(plugin.manifest.id))throw new ControlError('A guided entry already owns this ID.');if(current?.lifecycle==='removing'||(current?.approvalFingerprint??null)!==expected)throw new ControlError('Plugin changed during review. Reopen the preview.','conflict',409);this.db.prepare('INSERT INTO optimizer_plugins(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(plugin.manifest.id,JSON.stringify(plugin));this.audit('optimizer.registered',plugin.manifest.id);return plugin;});
  }
  setPluginRemoving(id:string,expected:string,removing:boolean){return this.transaction(()=>{const p=this.plugin(id);if(!p||p.approvalFingerprint!==expected)throw new ControlError('Plugin changed during removal.','conflict',409);if(removing&&this.pluginActiveReferences(id))throw new ControlError('An active session still uses this optimizer.');this.db.prepare('UPDATE optimizer_plugins SET value=? WHERE id=?').run(JSON.stringify({...p,lifecycle:removing?'removing':'ready'}),id);});}
  pluginProfileReferences(id:string){return (this.db.prepare('SELECT id,revision,value FROM profiles').all() as {id:string;revision:number;value:string}[]).filter(row=>this.decode<{tools:{id:string}[]}>(row.value).tools.some(t=>t.id===id)).map(({id,revision})=>({id,revision}));}
  removePlugin(id:string,expected:string,expectedProfiles?:{id:string;revision:number}[]){return this.transaction(()=>{
    if(expectedProfiles&&JSON.stringify(this.pluginProfileReferences(id))!==JSON.stringify(expectedProfiles))throw new ControlError('Affected profiles changed during removal. Review a fresh preview.','conflict',409);
    const p=this.plugin(id);if(!p||p.approvalFingerprint!==expected)throw new ControlError('Plugin registration changed.','conflict',409);if(this.pluginActiveReferences(id))throw new ControlError('This optimizer is referenced by an active session. Remove it after those sessions finish.');
    for(const row of this.db.prepare('SELECT id,revision,value FROM profiles').all() as {id:string;revision:number;value:string}[]){const value=this.decode<{tools:{id:string}[]}>(row.value);if(value.tools.some(t=>t.id===id)){value.tools=value.tools.filter(t=>t.id!==id);this.db.prepare('UPDATE profiles SET revision=?,value=? WHERE id=?').run(row.revision+1,JSON.stringify(value),row.id);}}
    for(const row of this.db.prepare('SELECT id,value FROM session_preferences').all() as {id:string;value:string}[]){const value=this.decode<SessionPreference>(row.value);if(value.tools.includes(id)){value.tools=value.tools.filter(t=>t!==id);delete value.toolConfig[id];value.updatedAt=new Date().toISOString();this.db.prepare('UPDATE session_preferences SET value=? WHERE id=?').run(JSON.stringify(value),row.id);}}
    this.db.prepare('DELETE FROM optimizer_plugins WHERE id=?').run(id);this.audit('optimizer.removed',id);
  });}
  pluginActiveReferences(id:string):number {return Number(this.db.prepare("SELECT count(*) AS n FROM sessions WHERE json_extract(value,'$.status') IN ('preflight','starting','running','degraded','stopping') AND julianday(json_extract(value,'$.heartbeatAt')) > julianday('now','-30 seconds') AND EXISTS(SELECT 1 FROM json_each(json_extract(value,'$.plannedTools')) WHERE value=?)").get(id)!.n);}
  schemaContext():SchemaContext {const plugins=this.plugins(),byId=new Map(plugins.map(p=>[p.manifest.id,p]));return {ids:new Set([...TOOL_IDS,...byId.keys()]),configuration:(id,value)=>{const plugin=byId.get(id);if(!plugin)throw new ControlError('Optimizer is not registered.');return pluginConfiguration(plugin.manifest,value);}};}
  putCandidate(candidate:OptimizerCandidate&{localPath?:string}){if(JSON.stringify(candidate).length>32768)throw new ControlError('Candidate metadata exceeds its limit.');this.db.prepare('INSERT INTO optimizer_candidates(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(candidate.id,JSON.stringify(candidate));this.db.exec('DELETE FROM optimizer_candidates WHERE rowid NOT IN (SELECT rowid FROM optimizer_candidates ORDER BY rowid DESC LIMIT 100)');this.audit('optimizer.candidate',candidate.id);}
  candidates():OptimizerCandidate[]{return (this.db.prepare('SELECT value FROM optimizer_candidates ORDER BY rowid DESC').all() as {value:string}[]).map(row=>{const {localPath,...publicCandidate}=this.decode<OptimizerCandidate&{localPath?:string}>(row.value);return publicCandidate;});}
  candidate(id:string):(OptimizerCandidate&{localPath?:string})|null {const row=this.db.prepare('SELECT value FROM optimizer_candidates WHERE id=?').get(id) as {value:string}|undefined;return row?this.decode(row.value):null;}
  removeCandidate(id:string){this.db.prepare('DELETE FROM optimizer_candidates WHERE id=?').run(id);}
  putValidation(value:ValidationReport){const key=value.id+':'+value.contextFingerprint;this.db.prepare('INSERT INTO optimizer_validation(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));this.db.exec('DELETE FROM optimizer_validation WHERE rowid NOT IN (SELECT rowid FROM optimizer_validation ORDER BY rowid DESC LIMIT 1000)');}
  retainValidation(value:ValidationReport){const row=this.db.prepare('SELECT value FROM optimizer_validation WHERE id=?').get(value.id+':'+value.contextFingerprint) as {value:string}|undefined;if(row)return this.decode<ValidationReport>(row.value);this.putValidation(value);return value;}
  validationHistory():ValidationReport[]{return (this.db.prepare('SELECT value FROM optimizer_validation ORDER BY rowid DESC LIMIT 100').all() as {value:string}[]).map(r=>this.decode<ValidationReport>(r.value));}
  registryCache():unknown {const row=this.db.prepare('SELECT value FROM registry_cache WHERE id=?').get('canonical') as {value:string}|undefined;if(!row)return null;if(row.value.length>3*1024*1024)throw new ControlError('Registry cache exceeds its budget.');try{return JSON.parse(row.value);}catch{throw new ControlError('Registry cache is malformed.');}}
  saveRegistryCache(value:unknown){const text=JSON.stringify(value);if(text.length>3*1024*1024)throw new ControlError('Registry cache exceeds its budget.');this.db.prepare('INSERT INTO registry_cache(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run('canonical',text);this.audit('registry.updated','canonical');}
  registryCandidates():import('../registry/types.js').Candidate[]{return (this.db.prepare('SELECT value FROM registry_candidates ORDER BY rowid DESC LIMIT 200').all() as {value:string}[]).map(r=>this.decode(r.value));}
  saveRegistryCandidate(candidate:import('../registry/types.js').Candidate){if(JSON.stringify(candidate).length>32768)throw new ControlError('Candidate exceeds its metadata budget.');this.db.prepare('INSERT INTO registry_candidates(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(candidate.id,JSON.stringify(candidate));this.db.exec('DELETE FROM registry_candidates WHERE rowid NOT IN (SELECT rowid FROM registry_candidates ORDER BY rowid DESC LIMIT 200)');}
  removeRegistryCandidate(id:string){this.db.prepare('DELETE FROM registry_candidates WHERE id=?').run(id);}
  registryDocument(url:string):import('../registry/network.js').CachedDocument|null {const row=this.db.prepare('SELECT value FROM registry_documents WHERE url=?').get(url) as {value:string}|undefined;return row?this.decode(row.value):null;}
  saveRegistryDocument(url:string,value:import('../registry/network.js').CachedDocument){if(JSON.stringify(value).length>262144)return;this.db.prepare('INSERT INTO registry_documents(url,value) VALUES(?,?) ON CONFLICT(url) DO UPDATE SET value=excluded.value').run(url,JSON.stringify(value));this.db.exec('DELETE FROM registry_documents WHERE rowid NOT IN (SELECT rowid FROM registry_documents ORDER BY rowid DESC LIMIT 40)');}
  registryJobs():import('../registry/types.js').DiscoveryJob[]{return (this.db.prepare('SELECT value FROM registry_jobs ORDER BY rowid DESC LIMIT 5').all() as {value:string}[]).map(r=>this.decode(r.value));}
  saveRegistryJob(value:import('../registry/types.js').DiscoveryJob){this.db.prepare('INSERT INTO registry_jobs(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(value.id,JSON.stringify(value));this.db.exec('DELETE FROM registry_jobs WHERE rowid NOT IN (SELECT rowid FROM registry_jobs ORDER BY rowid DESC LIMIT 20)');}
  onboarding():{completed:boolean;updatedAt:string|null}{const row=this.db.prepare('SELECT value FROM settings WHERE id=?').get('onboarding') as {value:string}|undefined;return row?this.decode(row.value):{completed:false,updatedAt:null};}
  completeOnboarding(){this.db.prepare('INSERT INTO settings(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run('onboarding',JSON.stringify({completed:true,updatedAt:new Date().toISOString()}));}
}
