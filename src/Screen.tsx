import {useEffect,useRef,useState,type ReactNode} from 'react';

/** Mount on first visit; retain drafts without exposing unrelated screens. */
export default function Screen({id,active,children}:{id:string;active:string;children:ReactNode}){
  const [visited,setVisited]=useState(id===active),root=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(id===active)setVisited(true);else root.current?.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog=>dialog.close());},[id,active]);
  return <div ref={root} className="workspace-screen" data-screen={id} hidden={id!==active}>{visited||id===active?children:null}</div>;
}
