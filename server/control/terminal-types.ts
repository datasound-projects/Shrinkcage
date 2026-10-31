import type { LaunchOptions } from './types.js';

export type TerminalTarget = 'terminal' | 'herdr';
export interface TerminalChoice { id:TerminalTarget; name:string; available:boolean; reason:string; version?:string|null }
export interface LaunchPreview { agent:string; profile:string; projectId:string; options:LaunchOptions; fingerprint:string; expiresAt:number; context:Record<string,string|null> }
export interface TerminalLaunch {
  id:string; fingerprint:string; target:TerminalTarget; createdAt:string; expiresAt:number;
  state:'opening'|'waiting'|'claimed'|'started'|'exited'|'failed';
  sessionId:string|null; error:string|null; preview:LaunchPreview; scriptHash?:string;
}
export type PublicTerminalLaunch = Pick<TerminalLaunch,'id'|'fingerprint'|'target'|'createdAt'|'expiresAt'|'state'|'sessionId'|'error'>;
export const publicLaunch = ({id,fingerprint,target,createdAt,expiresAt,state,sessionId,error}:TerminalLaunch):PublicTerminalLaunch => ({id,fingerprint,target,createdAt,expiresAt,state,sessionId,error});
