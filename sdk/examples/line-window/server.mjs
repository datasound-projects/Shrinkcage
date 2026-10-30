// MIT-licensed SDK example. No filesystem, shell, network or provider credentials.
import {createInterface} from 'node:readline';
const args=process.argv.slice(2),at=args.indexOf('--max-lines'),limit=at<0?100:Number(args[at+1]);
if(!Number.isSafeInteger(limit)||limit<10||limit>1000)process.exit(2);
const reply=(id,result,error)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,...(error?{error}:{result})})+'\n');
const input=createInterface({input:process.stdin});
input.on('line',line=>{
  if(Buffer.byteLength(line)>1024*1024)return;
  let m;try{m=JSON.parse(line);}catch{return;}
  if(m.id===undefined)return;
  if(m.method==='initialize')return reply(m.id,{protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'line-window',version:'1.0.0'}});
  if(m.method==='tools/list')return reply(m.id,{tools:[{name:'compact_output',description:'Return supplied text with adjacent duplicate lines folded and an explicit truncation marker. Use only when this loss of detail is acceptable.',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false},annotations:{readOnlyHint:true}}]});
  if(m.method==='tools/call'&&m.params?.name==='compact_output'){
    const text=m.params.arguments?.text;if(typeof text!=='string'||Buffer.byteLength(text)>512*1024)return reply(m.id,{content:[{type:'text',text:'Supply text under 512 KiB.'}],isError:true});
    const lines=text.split('\n'),unique=lines.filter((line,i)=>i===0||line!==lines[i-1]),visible=unique.slice(0,limit),omitted=unique.length-visible.length;
    if(omitted)visible.push(`[${omitted} more lines omitted; request the original output when detail matters]`);
    const output=visible.join('\n');return reply(m.id,{content:[{type:'text',text:output}],structuredContent:{input_bytes:Buffer.byteLength(text),output_bytes:Buffer.byteLength(output),folded_adjacent_lines:lines.length-unique.length,omitted_lines:omitted,measurement:'UTF-8 bytes; no token or financial savings claim'}});
  }
  reply(m.id,undefined,{code:-32601,message:'Method not supported'});
});
input.on('close',()=>process.exit(0));
