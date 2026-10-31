import { useEffect, useState } from 'react';

export const sections = [
  ['overview', 'grid', 'Overview'], ['managed', 'terminal', 'Sessions'],
  ['setup', 'plug', 'New session'], ['profiles', 'layers', 'Profiles'], ['sessions', 'folder', 'Saved history'],
  ['registry', 'layers', 'Optimizer Registry'], ['optimizers', 'layers', 'Installed tools'],
  ['validation', 'health', 'Validation'], ['headroom', 'layers', 'Headroom'], ['rtk', 'terminal', 'RTK'], ['serena', 'code', 'Serena'],
  ['cost-usage', 'chart', 'Cost & usage'], ['analytics', 'chart', 'Shared analytics'], ['benchmarks', 'chart', 'Experiments'],
  ['settings', 'plug', 'Settings'], ['connectors', 'plug', 'Connectors'], ['health', 'health', 'System health'],
] as const;
export const navigation = [
  {id:'overview',icon:'grid',label:'Overview',screens:['overview']},
  {id:'managed',icon:'terminal',label:'Sessions',screens:['managed','setup','profiles','sessions']},
  {id:'registry',icon:'layers',label:'Optimizers',screens:['registry','optimizers','validation','headroom','rtk','serena']},
  {id:'cost-usage',icon:'chart',label:'Cost & usage',screens:['cost-usage','analytics','benchmarks']},
  {id:'settings',icon:'plug',label:'Settings',screens:['settings','connectors','health']},
];
const valid=(id:string)=>sections.some(([key])=>key===id);
const fromHash=()=>{const id=window.location.hash.slice(1);return valid(id)?id:'overview';};

/** Navigation works even when a metrics source is offline. Existing deep links remain valid. */
export function useSectionNavigation(_ready?: boolean) {
  const [active,setActive]=useState(fromHash);
  useEffect(()=>{
    const update=()=>setActive(fromHash());
    const click=(event:MouseEvent)=>{if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const link=(event.target as Element)?.closest?.('a[href^="#"]');const id=link?.getAttribute('href')?.slice(1);if(!id||!valid(id))return;event.preventDefault();if(location.hash!=='#'+id)history.pushState(null,'','#'+id);setActive(id);};
    addEventListener('hashchange',update);document.addEventListener('click',click);
    return()=>{removeEventListener('hashchange',update);document.removeEventListener('click',click);};
  },[]);
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[active]);
  return {active,setActive:(id:string)=>{if(valid(id))setActive(id);}};
}
