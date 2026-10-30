import type { Profile, SavedProfile, ToolId } from './types.js';
const preset=(id:string,name:string,description:string,tools:ToolId[]):SavedProfile=>({revision:0,builtin:true,profile:{schemaVersion:1,id,name,description,agent:'codex',scope:'process',fallback:'explicit',tools:tools.map((id,i)=>({id,required:false,priority:100-i*10}))}});
export const DEFAULT_PROFILES:SavedProfile[]=[
  preset('baseline','Baseline','No managed optimizers. Existing external hooks and routing may still affect the run.',[]),
  preset('lean','Lean','RTK output reduction when the native hook is installed and reviewed.',['rtk']),
  preset('balanced','Balanced','RTK, a session-owned Serena MCP and scoped Headroom routing where compatible.',['rtk','serena','headroom']),
  preset('memory','Memory','Memory is guided until a reviewed account and version-specific adapter is available.',['rtk','serena','codemem']),
];
export const profileById=(id:string,saved:SavedProfile[])=>saved.find(p=>p.profile.id===id);
