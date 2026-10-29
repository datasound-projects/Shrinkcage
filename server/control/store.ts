import { DatabaseSync } from 'node:sqlite';
import { chmodSync, closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { appDataDir } from '../platform.js';
import { ControlError, digest, parseProfile } from './schema.js';
import { DEFAULT_PROFILES } from './profiles.js';
import type { Benchmark, ManagedSession, ProjectRef, SavedProfile, SetupReceipt } from './types.js';

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
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
    const version=(this.db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version;
    if(version>1){this.db.close();throw new ControlError('Control state was created by a newer Shrinkcage version.');}
    this.db.exec(`CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, label TEXT NOT NULL, path TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, owner_pid INTEGER NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS comparisons(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, at TEXT NOT NULL, event TEXT NOT NULL, resource TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS extensions(id TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS locks(project_id TEXT PRIMARY KEY, token TEXT NOT NULL, pid INTEGER NOT NULL);
      PRAGMA user_version=1;`);
  }
  close(){this.db.close();}
  lockProof(projectId:string){return this.db.prepare('SELECT token,pid FROM locks WHERE project_id=?').get(projectId) as {token:string;pid:number}|undefined;}
  reserveLock(projectId:string,token:string){return Number(this.db.prepare('INSERT OR IGNORE INTO locks(project_id,token,pid) VALUES(?,?,?)').run(projectId,token,process.pid).changes)>0;}
  reclaimLock(projectId:string,oldToken:string,token:string){return Number(this.db.prepare('UPDATE locks SET token=?,pid=? WHERE project_id=? AND token=?').run(token,process.pid,projectId,oldToken).changes)>0;}
  releaseLock(projectId:string,token:string){this.db.prepare('DELETE FROM locks WHERE project_id=? AND token=?').run(projectId,token);}
  private decode<T>(value:unknown):T {try{if(typeof value!=='string'||value.length>1048576)throw Error();return JSON.parse(value) as T;}catch{throw new ControlError('Stored control data is malformed. Back it up before recovery.','corrupt',503);}}
  private transaction<T>(fn:()=>T):T {this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  audit(event:string,resource:string){this.db.prepare('INSERT INTO audit(at,event,resource) VALUES(?,?,?)').run(new Date().toISOString(),event,resource);this.db.exec('DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT 500)');}
  profiles():SavedProfile[]{
    const result=DEFAULT_PROFILES.map(p=>structuredClone(p));
    for(const row of this.db.prepare('SELECT id,revision,value FROM profiles ORDER BY id LIMIT 100').all() as {id:string;revision:number;value:string}[]){const profile=parseProfile(this.decode(row.value));const i=result.findIndex(p=>p.profile.id===profile.id);const saved={profile,revision:row.revision,builtin:false};if(i<0)result.push(saved);else result[i]=saved;}
    return result;
  }
  saveProfile(value:unknown,revision:number):SavedProfile{
    const profile=parseProfile(value);if(profile.id==='baseline')throw new ControlError('Baseline is immutable; create a custom profile instead.');
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
  createSession(session:ManagedSession,token:string){this.prune();if((this.db.prepare('SELECT count(*) AS n FROM sessions').get() as {n:number}).n>=2000)throw new ControlError('The managed record limit is 2000. Remove old completed metadata before another launch.');this.db.prepare('INSERT INTO sessions(id,token_hash,owner_pid,value) VALUES(?,?,?,?)').run(session.id,digest(token),process.pid,JSON.stringify(session));this.audit('session.created',session.id);}
  owns(id:string,token:string):boolean{return (this.db.prepare('SELECT token_hash FROM sessions WHERE id=?').get(id) as {token_hash:string}|undefined)?.token_hash===digest(token);}
  updateSession(session:ManagedSession,token:string){const result=this.db.prepare('UPDATE sessions SET value=? WHERE id=? AND token_hash=?').run(JSON.stringify(session),session.id,digest(token));if(!Number(result.changes))throw new ControlError('Session ownership could not be verified.','ownership',403);}
  sessions():ManagedSession[]{
    return (this.db.prepare('SELECT value FROM sessions ORDER BY rowid DESC LIMIT 200').all() as {value:string}[]).map(row=>{
      const s=this.decode<ManagedSession>(row.value);if(['preflight','starting','running','degraded','stopping'].includes(s.status)&&Date.now()-Date.parse(s.heartbeatAt)>30000)return {...s,status:'abandoned',diagnostics:[...s.diagnostics,'Owner heartbeat expired. No persisted PID will be signalled.']} as ManagedSession;return s;
    });
  }
  removeSession(id:string){const s=this.sessions().find(s=>s.id===id);if(!s)throw new ControlError('Managed session not found.','missing',404);if(!['exited','failed','abandoned'].includes(s.status))throw new ControlError('Stop this session in its owning terminal before deleting metadata.');this.db.prepare('DELETE FROM sessions WHERE id=?').run(id);}
  prune(days=90){if(!Number.isSafeInteger(days)||days<1||days>3650)throw new ControlError('Retention must be between 1 and 3650 days.');const cutoff=new Date(Date.now()-days*86400000).toISOString();this.db.prepare("DELETE FROM sessions WHERE COALESCE(json_extract(value,'$.endedAt'),json_extract(value,'$.heartbeatAt')) < ?").run(cutoff);this.db.exec('DELETE FROM comparisons WHERE rowid NOT IN(SELECT rowid FROM comparisons ORDER BY rowid DESC LIMIT 100)');}
  putReceipt(receipt:SetupReceipt){if(!this.db.prepare('SELECT id FROM receipts WHERE id=?').get(receipt.id)&&(this.db.prepare('SELECT count(*) AS n FROM receipts').get() as {n:number}).n>=200)throw new ControlError('The owned setup receipt limit is 200. Retain backups and review cleanup before another setup.');this.db.prepare('INSERT INTO receipts(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(receipt.id,JSON.stringify(receipt));}
  receipts():SetupReceipt[]{return (this.db.prepare('SELECT value FROM receipts ORDER BY rowid DESC LIMIT 200').all() as {value:string}[]).map(row=>this.decode<SetupReceipt>(row.value));}
  addComparison(value:Omit<Benchmark,'id'>):Benchmark{const b={...value,id:randomUUID()};this.db.prepare('INSERT INTO comparisons(id,value) VALUES(?,?)').run(b.id,JSON.stringify(b));this.prune();return b;}
  comparisons():Benchmark[]{return (this.db.prepare('SELECT value FROM comparisons ORDER BY rowid DESC LIMIT 100').all() as {value:string}[]).map(row=>this.decode<Benchmark>(row.value));}
  putExtension(id:string,value:unknown){if(!this.db.prepare('SELECT id FROM extensions WHERE id=?').get(id)&&(this.db.prepare('SELECT count(*) AS n FROM extensions').get() as {n:number}).n>=30)throw new ControlError('The extension preview limit is 30.');this.db.prepare('INSERT INTO extensions(id,value) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(id,JSON.stringify(value));}
  extensions():unknown[]{return (this.db.prepare('SELECT value FROM extensions ORDER BY id').all() as {value:string}[]).map(row=>this.decode(row.value));}
}
