import { BILLING_MODES, TOOL_IDS, type ToolConfiguration } from '../types.js';
import { ControlError, id, object, text } from '../schema.js';
import { PLUGIN_MECHANISMS, type PluginArgument, type PluginManifest, type PluginOption } from './types.js';

const label=(v:unknown,max=120)=>{const s=text(v,max);if(credentialShape.test(s))throw new ControlError('Credential-shaped plugin metadata is not permitted.');return s;};
const semver=(v:unknown):v is string=>typeof v==='string'&&/^\d+\.\d+\.\d+$/.test(v);
const credentialShape=/(?:\bsk-|AIza|\bgh[pousr]_|github_pat_)/i;
const safeArgument=(v:unknown):v is string=>typeof v==='string'&&v.length<=160&&(v==='.'||/^-{0,2}[a-zA-Z0-9][a-zA-Z0-9_.:@=-]*$/.test(v))&&!credentialShape.test(v);
const publicSource=(v:unknown):v is string=>typeof v==='string'&&v.length<=300&&/^https:\/\/[a-zA-Z0-9.-]+(?:\/[a-zA-Z0-9_./#-]*)?$/.test(v)&&!credentialShape.test(v);
export function parsePluginManifest(value:unknown):PluginManifest {
  if(!value||typeof value!=='object'||JSON.stringify(value).length>16384)throw new ControlError('Plugin manifest must be a bounded JSON object.');
  const v=object(value,['schemaVersion','id','name','version','source','description','mechanism','template','layers','agents','platforms','architectures','billingModes','permissions','arguments','configuration','dependencies','conflicts','toolVersion']);
  if(v.schemaVersion!==2||!id(v.id)||credentialShape.test(String(v.id))||TOOL_IDS.includes(v.id as never)||String(v.id).startsWith('shrinkcage')||!semver(v.version)||!publicSource(v.source))throw new ControlError('Invalid plugin identity, version or public source. Built-in IDs are reserved.');
  if(!PLUGIN_MECHANISMS.includes(v.mechanism as never)||!['mcp-stdio','review-required'].includes(String(v.template))||v.template==='mcp-stdio'&&v.mechanism!=='mcp-stdio')throw new ControlError('Unknown integration pattern. Use review-required for an unimplemented interface.');
  const list=(key:string,allowed?:readonly string[])=>{const raw=v[key];if(!Array.isArray(raw)||new Set(raw).size!==raw.length)throw new ControlError('Expected a distinct metadata list.');return raw.map(x=>{const s=label(x,100);if(allowed&&!allowed.includes(s))throw new ControlError('Unsupported plugin capability.');return s;});};
  const agents=list('agents',['codex','claude']),platforms=list('platforms',['darwin','linux','win32']),architectures=list('architectures',['x64','arm64','any']),billingModes=list('billingModes',BILLING_MODES);
  if(!agents.length||!platforms.length||!architectures.length||!billingModes.length)throw new ControlError('Declare supported agents, platforms, architectures and billing modes.');
  const configuration:Record<string,PluginOption>={};const options=object(v.configuration,Object.keys(v.configuration&&typeof v.configuration==='object'?v.configuration:{}));
  for(const [key,raw]of Object.entries(options)){
    if(!/^[a-z][a-zA-Z0-9]{0,39}$/.test(key)||['command','args','env','token','apiKey','password','secret','timeoutSeconds'].includes(key))throw new ControlError('Configuration must contain typed non-secret options, not executable or credential fields.');
    const o=object(raw,['type','label','default','min','max','values']);
    if(!['integer','boolean','enum'].includes(String(o.type)))throw new ControlError('Only integer, boolean and enumerated plugin options are supported.');
    if(o.type==='integer'){
      if(![o.min,o.max,o.default].every(Number.isSafeInteger)||Number(o.min)<0||Number(o.max)>1_000_000||Number(o.min)>Number(o.max)||Number(o.default)<Number(o.min)||Number(o.default)>Number(o.max)||o.values!==undefined)throw new ControlError('Invalid bounded integer option.');
    }else if(o.type==='boolean'){
      if(typeof o.default!=='boolean'||o.min!==undefined||o.max!==undefined||o.values!==undefined)throw new ControlError('Invalid boolean option.');
    }else if(!Array.isArray(o.values)||!o.values.length||o.values.some(s=>!safeArgument(s))||new Set(o.values).size!==o.values.length||!o.values.includes(o.default)||o.min!==undefined||o.max!==undefined)throw new ControlError('Invalid enumerated option.');
    configuration[key]={type:o.type as PluginOption['type'],label:label(o.label,80),default:o.default as PluginOption['default'],...(o.min===undefined?{}:{min:Number(o.min),max:Number(o.max)}),...(o.values===undefined?{}:{values:o.values as string[]})};
  }
  if(!Array.isArray(v.arguments))throw new ControlError('Expected a bounded, declarative argument list.');
  const args:PluginArgument[]=v.arguments.map(raw=>{
    if(typeof raw==='string'){if(!safeArgument(raw)||/^--?(?:eval|execute|command|token|api-key|password|secret)(?:=|$)/i.test(raw))throw new ControlError('Unsafe argument. Generic adapters do not accept code, paths, URLs or credentials.');return raw;}
    const a=object(raw,['option']);if(typeof a.option!=='string'||!configuration[a.option])throw new ControlError('Argument references an undeclared option.');return {option:a.option};
  });
  const dependencies=list('dependencies'),conflicts=list('conflicts');if([...dependencies,...conflicts].some(x=>!id(x)||x===v.id))throw new ControlError('Invalid plugin dependency or conflict.');
  const version=object(v.toolVersion,['min','maxMajor']);if(!semver(version.min)||!Number.isSafeInteger(version.maxMajor)||Number(version.maxMajor)<Number(version.min.split('.')[0])||Number(version.maxMajor)>999)throw new ControlError('Declare an explicit supported tool-version boundary.');
  return {schemaVersion:2,id:v.id as string,name:label(v.name,60),version:v.version,source:v.source,description:label(v.description,240),mechanism:v.mechanism as PluginManifest['mechanism'],template:v.template as PluginManifest['template'],layers:list('layers'),agents:agents as PluginManifest['agents'],platforms,architectures,billingModes:billingModes as PluginManifest['billingModes'],permissions:list('permissions',['project-read','project-write','network','persistent-memory']) as PluginManifest['permissions'],arguments:args,configuration,dependencies,conflicts,toolVersion:{min:version.min,maxMajor:Number(version.maxMajor)}};
}
export function pluginConfiguration(manifest:PluginManifest,value:unknown):ToolConfiguration {
  const input=object(value,Object.keys(manifest.configuration));const result:ToolConfiguration={};
  for(const [key,option]of Object.entries(manifest.configuration)){
    const v=input[key]??option.default;
    if(option.type==='integer'&&(!Number.isSafeInteger(v)||Number(v)<option.min!||Number(v)>option.max!)||option.type==='boolean'&&typeof v!=='boolean'||option.type==='enum'&&!option.values!.includes(v as string))throw new ControlError('Plugin configuration is outside its declared capability schema.');
    result[key]=v as string|number|boolean;
  }
  return result;
}
export function pluginArguments(manifest:PluginManifest,value:unknown):string[]{const config=pluginConfiguration(manifest,value);return manifest.arguments.map(a=>typeof a==='string'?a:String(config[a.option]));}
export function pluginVersionCompatible(version:string,min:string,maxMajor:number):boolean {
  if(!semver(version)||!semver(min))return false;const v=version.split('.').map(Number),m=min.split('.').map(Number);
  if(v[0]>maxMajor||v[0]===0&&v[1]!==m[1])return false;
  for(let i=0;i<3;i++){if(v[i]>m[i])return true;if(v[i]<m[i])return false;}return true;
}
