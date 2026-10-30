import { ControlError, object } from './schema.js';
import { executable, runBounded } from './probe.js';
import type { AccountingSettings, AgentDetection, BillingEvidence, BillingMode, ManagedSession, PriceRate, Recommendation, SessionAccounting, SessionUsage } from './types.js';

export { BILLING_MODES } from './types.js';
export { billingMode } from './schema.js';
export const EMPTY_ACCOUNTING: AccountingSettings = {schemaVersion:1,prices:[],monthlyApiBudgetUsd:null,subscriptionMonthlyFeeUsd:null};
const amount=(v:unknown,nullable=false):number|null=>{
  if(nullable&&v===null)return null;
  if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1_000_000)throw new ControlError('Expected a non-negative finite USD amount.');
  return v;
};
export function parseAccounting(value:unknown):AccountingSettings {
  const v=object(value,['schemaVersion','prices','monthlyApiBudgetUsd','subscriptionMonthlyFeeUsd']);
  if(v.schemaVersion!==1||!Array.isArray(v.prices)||v.prices.length>64)throw new ControlError('Invalid accounting settings.');
  const seen=new Set<string>();
  const prices=v.prices.map(raw=>{
    const p=object(raw,['model','provider','input','output','cached','cacheWrite','source','reviewedAt']);
    if(p.provider!==undefined&&p.provider!==null&&(typeof p.provider!=='string'||!/^[a-zA-Z0-9_.:@-]{1,120}$/.test(p.provider)||/^sk-|^AIza|^gh[pousr]_|^github_pat_/i.test(p.provider)))throw new ControlError('Use a provider ID, not credentials.');
    const key=(p.provider??'*')+':'+p.model;
    if(typeof p.model!=='string'||!/^[a-zA-Z0-9_.:@-]{1,120}$/.test(p.model)||/^sk-|^AIza|^gh[pousr]_|^github_pat_/i.test(p.model)||seen.has(key))throw new ControlError('Use a unique exact model and provider ID.');
    if(typeof p.source!=='string'||!/^https:\/\/[a-zA-Z0-9.-]+(?:\/[a-zA-Z0-9_./#-]*)?$/.test(p.source)||p.source.length>300)throw new ControlError('Pricing needs a public HTTPS source.');
    if(typeof p.reviewedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.reviewedAt)||!Number.isFinite(Date.parse(p.reviewedAt))||new Date(p.reviewedAt).toISOString().slice(0,10)!==p.reviewedAt||p.reviewedAt>new Date().toISOString().slice(0,10))throw new ControlError('Pricing needs a valid past or current review date.');
    seen.add(key);
    return {model:p.model,...(p.provider===undefined?{}:{provider:p.provider as string|null}),input:amount(p.input)!,output:amount(p.output)!,cached:amount(p.cached,true),cacheWrite:amount(p.cacheWrite,true),source:p.source,reviewedAt:p.reviewedAt} satisfies PriceRate;
  });
  return {schemaVersion:1,prices,monthlyApiBudgetUsd:amount(v.monthlyApiBudgetUsd,true),subscriptionMonthlyFeeUsd:amount(v.subscriptionMonthlyFeeUsd,true)};
}

/** Never open an auth file or retain command output. These are the clients' own safe status interfaces. */
export async function inspectBilling(agent:AgentDetection,env:NodeJS.ProcessEnv,requested?:BillingMode):Promise<BillingEvidence> {
  let nativeMode:BillingMode='unknown';
  if(agent.compatible)try{
    const binary=await executable(agent.id,env);
    if(binary){
      if(agent.id==='claude'){
        const help=await runBounded(binary,['auth','status','--help'],{env,timeout:2500});
        if(help.code!==0||!/Usage:\s*claude(?:\.exe)?\s+auth\s+status\b/i.test(help.stdout)||!/--json\b/.test(help.stdout))throw new ControlError('Native auth status interface is not available.');
      }
      const result=await runBounded(binary,agent.id==='codex'?['login','status']:['auth','status','--json'],{env,timeout:3500});
      if(result.code===0){
        if(agent.id==='codex'){
          const s=result.stdout+'\n'+result.stderr;
          if(/logged in using (?:ChatGPT|a ChatGPT)/i.test(s))nativeMode='subscription';
          else if(/logged in using (?:an? )?API key/i.test(s))nativeMode='api';
        }else if(agent.id==='claude'){
          const v=JSON.parse(result.stdout);
          if(v.loggedIn===true&&v.authMethod==='claude.ai')nativeMode='subscription';
          else if(v.loggedIn===true&&['api_key','apiKey','console'].includes(v.authMethod))nativeMode='api';
        }
      }
    }
  }catch{/* unknown is meaningful, not a failed authentication attempt */}
  const mode=requested??nativeMode;
  return {mode,nativeMode,source:requested!==undefined?'user-declared':nativeMode==='unknown'?'unavailable':'native-status',checkedAt:new Date().toISOString(),limitations:[
    'Billing labels do not change authentication. Native login, sandbox, permissions and approvals remain with the CLI.',
    ...(nativeMode==='unknown'?['Native billing status was unavailable; a declared mode is not proof of provider billing.']:[]),
    ...(requested&&requested!=='unknown'&&nativeMode!=='unknown'&&requested!==nativeMode?['Declared billing conflicts with the native login status.']:[]),
  ]};
}

export function estimateUsage(usage:SessionUsage|null|undefined,rate:PriceRate|undefined):number|null {
  if(!usage||!rate||usage.stale||usage.modelCoverage&&usage.modelCoverage!=='single'||usage?.coverage!=='complete-file')return null;
  const {inputTokens:i,outputTokens:o,cachedTokens:c}=usage;
  // OpenAI-compatible native records do not report cache-creation counts. An
  // explicitly qualified input-rate estimate does not turn that missing count into a reported zero.
  const w=usage.cacheWriteTokens??(usage.cacheWriteIncludedInInputRate?0:null);
  if([i,o,c,w].some(v=>v===null||!Number.isSafeInteger(v)||v!<0))return null;
  if(c!+w!>i!)return null;
  if(c!>0&&rate.cached===null||w!>0&&rate.cacheWrite===null)return null;
  // Normalized input includes cache reads/writes. Reasoning is an output subset, never added again.
  return ((i!-c!-w!)*rate.input+o!*rate.output+c!*(rate.cached??0)+w!*(rate.cacheWrite??0))/1_000_000;
}
export function accountSession(session:ManagedSession,settings:AccountingSettings):SessionAccounting {
  const billing=session.billing?.mode??'unknown',model=session.usage?.model;
  const provider=session.usage?.provider;
  const rate=settings.prices.find(p=>p.model===model&&p.provider&&p.provider===provider)??settings.prices.find(p=>p.model===model&&!p.provider),estimate=estimateUsage(session.usage,rate);
  return {billing,apiEstimatedUsd:billing==='api'?estimate:null,apiEquivalentUsd:billing==='subscription'?estimate:null,
    reportedCostUsd:billing==='api'?session.usage?.reportedCostUsd??null:null,rateSource:rate?.source??null,
    method:'Exact model rates per million tokens; uncached input, cache reads, cache writes and output priced separately.',
    limitations:[...(!rate?['No reviewed exact-model price is configured.']:['Prices are user-configured estimates, not provider invoices.']),
      ...(billing==='subscription'?['API-equivalent value is an estimate, not incremental subscription spending or money saved.']:[]),
      ...(['unknown','hybrid'].includes(billing)?['Billing is unknown or mixed; no monetary total is assigned.']:[]),
      'Gateway markups, taxes and provider invoice adjustments are not inferred.',
      ...(session.usage?.modelCoverage&&session.usage.modelCoverage!=='single'?['Mixed or unresolved native models/providers cannot be priced using the latest or requested model.']:[]),
      ...(session.usage?.cacheWriteIncludedInInputRate?['Cache-creation count is unavailable. This OpenAI-compatible estimate assumes cache creation uses the configured input rate without a separate surcharge.']:[]),
      ...(session.usage?.coverage==='sampled-file'?['A partial session record cannot establish a complete cost.']:[])]};
}
export function recommendations(sessions:ManagedSession[],settings:AccountingSettings):Recommendation[] {
  const result:Recommendation[]=[];
  if(sessions.some(s=>(s.billing?.mode??'unknown')==='unknown'))result.push({id:'billing',title:'Label session billing',detail:'Unknown billing cannot be treated as API spending or subscription usage.',severity:'info'});
  if(sessions.some(s=>s.usage?.model&&!settings.prices.some(p=>p.model===s.usage?.model)))result.push({id:'prices',title:'Add exact-model prices',detail:'Configure reviewed input, output and cache rates to see qualified cost estimates.',severity:'info'});
  const month=new Date().toISOString().slice(0,7),known=sessions.filter(s=>s.startedAt.startsWith(month)&&s.accounting?.apiEstimatedUsd!==null&&s.accounting?.apiEstimatedUsd!==undefined);
  const spend=known.reduce((n,s)=>n+(s.accounting?.apiEstimatedUsd??0),0);
  if(known.length&&settings.monthlyApiBudgetUsd!==null&&spend>=settings.monthlyApiBudgetUsd)result.push({id:'budget',title:'Estimated API budget reached',detail:'Known estimates among the latest 200 managed records reached the configured monthly budget. Missing and older sessions are excluded; no running CLI is interrupted.',severity:'attention'});
  for(const s of sessions.slice(0,50)){
    if(s.inheritedConfiguration?s.inheritedConfiguration.length>0:s.diagnostics.some(d=>/external.*hook|inherited/i.test(d)))result.push({id:'inheritance-'+s.id,title:'Review inherited optimization',detail:'External hooks or routing may affect this session independently of its selected stack.',sessionId:s.id,severity:'attention'});
    if((s.usage?.retries??0)>2)result.push({id:'retries-'+s.id,title:'Review repeated requests',detail:'Observed retries can outweigh token reductions. Check quality and reliability before choosing a stronger profile.',sessionId:s.id,severity:'attention'});
  }
  return result.slice(0,12);
}
