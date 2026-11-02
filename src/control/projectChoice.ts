const KEY='shrinkcage:project';
let current='';
export function chosenProject(){try{return sessionStorage.getItem(KEY)??current;}catch{return current;}}
export function chooseProject(id:string){current=id;try{sessionStorage.setItem(KEY,id);}catch{/* memory-only selection is enough */}window.dispatchEvent(new CustomEvent('shrinkcage:project',{detail:id}));}
export function chosenSession(){try{return sessionStorage.getItem('shrinkcage:session')??'';}catch{return '';}}
export function chooseSession(id:string,projectId:string){chooseProject(projectId);try{sessionStorage.setItem('shrinkcage:session',id);}catch{/* navigation still works */}window.dispatchEvent(new CustomEvent('shrinkcage:session-created',{detail:{id,projectId}}));}
